package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v3"
	"github.com/rs/cors"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"

	"video-meeting-app/db"
)

// Configuration
const (
	DefaultPort           = "8080"
	MaxRetries           = 3
	RetryDelay           = 1 * time.Second
	CookieName           = "session_token"
	MaxMessageSize       = 1024 * 1024 // 1MB
	WriteWait            = 10 * time.Second
	PongWait             = 60 * time.Second
	PingPeriod           = (PongWait * 9) / 10
	ParticipantTimeout   = 5 * time.Minute
)

// Updated allowed origins
var allowedOrigins = []string{
	"https://famous-sprite-14c531.netlify.app",
	"https://google-meet-clone-lovat.vercel.app",
	"https://google-meet-clone-ma9v.onrender.com",
	"http://localhost:5173",
	"http://localhost:3000",
}

// WebSocket upgrader
var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		return isAllowedOrigin(origin)
	},
}

// Models
type User struct {
	ID        string    `json:"id" bson:"_id"`
	Name      string    `json:"name" bson:"name"`
	Email     string    `json:"email" bson:"email"`
	Password  string    `json:"-" bson:"password"`
	CreatedAt time.Time `json:"createdAt" bson:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt" bson:"updatedAt"`
}

type Meeting struct {
	ID           string    `json:"id" bson:"_id"`
	Title        string    `json:"title" bson:"title"`
	Description  string    `json:"description,omitempty" bson:"description,omitempty"`
	CreatedBy    string    `json:"createdBy" bson:"createdBy"`
	ScheduledFor string    `json:"scheduledFor,omitempty" bson:"scheduledFor,omitempty"`
	CreatedAt    time.Time `json:"createdAt" bson:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt" bson:"updatedAt"`
	IsPrivate    bool      `json:"isPrivate" bson:"isPrivate"`
	IsActive     bool      `json:"isActive" bson:"isActive"`
	MaxParticipants int    `json:"maxParticipants" bson:"maxParticipants"`
}

type Participant struct {
	ID              string    `json:"id" bson:"_id"`
	MeetingID       string    `json:"meetingId" bson:"meetingId"`
	UserID          string    `json:"userId" bson:"userId"`
	UserName        string    `json:"userName" bson:"userName"`
	PeerID          string    `json:"peerId" bson:"peerId"`
	IsHost          bool      `json:"isHost" bson:"isHost"`
	IsAudioEnabled  bool      `json:"isAudioEnabled" bson:"isAudioEnabled"`
	IsVideoEnabled  bool      `json:"isVideoEnabled" bson:"isVideoEnabled"`
	IsScreenSharing bool      `json:"isScreenSharing" bson:"isScreenSharing"`
	JoinedAt        time.Time `json:"joinedAt" bson:"joinedAt"`
	LastActive      time.Time `json:"lastActive" bson:"lastActive"`
}

type ChatMessage struct {
	ID        string    `json:"id" bson:"_id"`
	MeetingID string    `json:"meetingId" bson:"meetingId"`
	UserID    string    `json:"userId" bson:"userId"`
	UserName  string    `json:"userName" bson:"userName"`
	Message   string    `json:"message" bson:"message"`
	Timestamp time.Time `json:"timestamp" bson:"timestamp"`
}

type WebSocketMessage struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data,omitempty"`
	MeetingID string      `json:"meetingId,omitempty"`
	UserID    string      `json:"userId,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
}

type SignalingData struct {
	Type       string                 `json:"type"`
	FromPeerID string                 `json:"fromPeerId"`
	ToPeerID   string                 `json:"toPeerId"`
	Offer      *webrtc.SessionDescription `json:"offer,omitempty"`
	Answer     *webrtc.SessionDescription `json:"answer,omitempty"`
	Candidate  *webrtc.ICECandidateInit   `json:"candidate,omitempty"`
}

type Response struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// WebSocket connection manager
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	meetings   map[string]map[*Client]bool // meetingId -> clients
}

type Client struct {
	hub       *Hub
	conn      *websocket.Conn
	send      chan []byte
	userID    string
	meetingID string
	peerID    string
}

// Initialize hub
func newHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		meetings:   make(map[string]map[*Client]bool),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			if h.meetings[client.meetingID] == nil {
				h.meetings[client.meetingID] = make(map[*Client]bool)
			}
			h.meetings[client.meetingID][client] = true
			
			log.Printf("Client registered: %s in meeting %s", client.userID, client.meetingID)
			
			// Notify other participants about new user
			h.broadcastToMeeting(client.meetingID, WebSocketMessage{
				Type:      "user-joined",
				Data:      map[string]string{"userId": client.userID, "peerId": client.peerID},
				MeetingID: client.meetingID,
				Timestamp: time.Now(),
			}, client)

		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				delete(h.meetings[client.meetingID], client)
				close(client.send)
				
				log.Printf("Client unregistered: %s from meeting %s", client.userID, client.meetingID)
				
				// Clean up empty meeting rooms
				if len(h.meetings[client.meetingID]) == 0 {
					delete(h.meetings, client.meetingID)
				} else {
					// Notify other participants about user leaving
					h.broadcastToMeeting(client.meetingID, WebSocketMessage{
						Type:      "user-left",
						Data:      map[string]string{"userId": client.userID, "peerId": client.peerID},
						MeetingID: client.meetingID,
						Timestamp: time.Now(),
					}, nil)
				}
			}

		case message := <-h.broadcast:
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
		}
	}
}

func (h *Hub) broadcastToMeeting(meetingID string, message WebSocketMessage, excludeClient *Client) {
	messageBytes, err := json.Marshal(message)
	if err != nil {
		log.Printf("Error marshaling websocket message: %v", err)
		return
	}

	if clients, exists := h.meetings[meetingID]; exists {
		for client := range clients {
			if excludeClient != nil && client == excludeClient {
				continue
			}
			select {
			case client.send <- messageBytes:
			default:
				close(client.send)
				delete(h.clients, client)
				delete(h.meetings[meetingID], client)
			}
		}
	}
}

// Global hub instance
var hub = newHub()

// Initialize MongoDB connection with retry logic
func initMongoDB() error {
	var err error
	for i := 0; i < MaxRetries; i++ {
		err = db.ConnectDB()
		if err == nil {
			log.Println("Successfully connected to MongoDB")
			
			// Create indexes for better performance
			createIndexes()
			return nil
		}
		log.Printf("Failed to connect to MongoDB (attempt %d/%d): %v", i+1, MaxRetries, err)
		if i < MaxRetries-1 {
			time.Sleep(RetryDelay)
		}
	}
	return fmt.Errorf("failed to connect to MongoDB after %d attempts: %v", MaxRetries, err)
}

func createIndexes() {
	ctx := context.Background()
	
	// Create indexes for better query performance
	userEmailIndex := mongo.IndexModel{
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true),
	}
	
	meetingCreatedByIndex := mongo.IndexModel{
		Keys: bson.D{{Key: "createdBy", Value: 1}},
	}
	
	participantMeetingIndex := mongo.IndexModel{
		Keys: bson.D{{Key: "meetingId", Value: 1}, {Key: "userId", Value: 1}},
	}
	
	participantLastActiveIndex := mongo.IndexModel{
		Keys: bson.D{{Key: "lastActive", Value: 1}},
	}
	

	// Create indexes
	db.Users.Indexes().CreateOne(ctx, userEmailIndex)
	db.Meetings.Indexes().CreateOne(ctx, meetingCreatedByIndex)
	db.Participants.Indexes().CreateOne(ctx, participantMeetingIndex)
	db.Participants.Indexes().CreateOne(ctx, participantLastActiveIndex)
	
}

// Middleware
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		clientIP := getClientIP(r)
		log.Printf("Started %s %s from %s (Origin: %s)", r.Method, r.URL.Path, clientIP, r.Header.Get("Origin"))
		next.ServeHTTP(w, r)
		log.Printf("Completed %s %s in %v", r.Method, r.URL.Path, time.Since(start))
	})
}

func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header
	forwarded := r.Header.Get("X-Forwarded-For")
	if forwarded != "" {
		return strings.Split(forwarded, ",")[0]
	}
	
	// Check X-Real-Ip header
	realIP := r.Header.Get("X-Real-Ip")
	if realIP != "" {
		return realIP
	}
	
	return r.RemoteAddr
}

// Improved CORS middleware
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		
		// Always set basic headers
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		
		// Handle CORS
		if origin != "" && isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else if origin == "" {
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigins[0])
		}
		
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Type, Authorization, Set-Cookie")
		w.Header().Set("Vary", "Origin")
		
		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		next.ServeHTTP(w, r)
	})
}

// Rate limiting middleware (simple in-memory implementation)
var requestCounts = make(map[string]int)
var lastReset = time.Now()

func rateLimitMiddleware(requestsPerMinute int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			clientIP := getClientIP(r)
			
			// Reset counts every minute
			if time.Since(lastReset) > time.Minute {
				requestCounts = make(map[string]int)
				lastReset = time.Now()
			}
			
			requestCounts[clientIP]++
			
			if requestCounts[clientIP] > requestsPerMinute {
				sendErrorResponse(w, "Rate limit exceeded", http.StatusTooManyRequests)
				return
			}
			
			next.ServeHTTP(w, r)
		})
	}
}

// Helper functions
func isAllowedOrigin(origin string) bool {
	for _, allowed := range allowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

func setSessionCookie(w http.ResponseWriter, token string) {
	cookie := &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
		MaxAge:   86400 * 7, // 7 days
	}
	http.SetCookie(w, cookie)
}

func clearSessionCookie(w http.ResponseWriter) {
	cookie := &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
		MaxAge:   -1,
	}
	http.SetCookie(w, cookie)
}

func sendJSONResponse(w http.ResponseWriter, statusCode int, response Response) {
	w.WriteHeader(statusCode)

	jsonData, err := json.Marshal(response)
	if err != nil {
		log.Printf("Error marshaling response: %v", err)
		fallbackResponse := Response{
			Success: false,
			Error:   "Internal server error",
		}
		fallbackData, _ := json.Marshal(fallbackResponse)
		w.Write(fallbackData)
		return
	}

	if _, err := w.Write(jsonData); err != nil {
		log.Printf("Error writing response: %v", err)
	}
}

func sendSuccessResponse(w http.ResponseWriter, data interface{}) {
	sendJSONResponse(w, http.StatusOK, Response{
		Success: true,
		Data:    data,
	})
}

func sendErrorResponse(w http.ResponseWriter, message string, statusCode int) {
	sendJSONResponse(w, statusCode, Response{
		Success: false,
		Error:   message,
	})
}

func validateEmail(email string) bool {
	return strings.Contains(email, "@") && len(email) > 5
}

func validatePassword(password string) error {
	if len(password) < 8 {
		return fmt.Errorf("password must be at least 8 characters long")
	}
	return nil
}

// Enhanced handlers with better validation and error handling
func healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Check MongoDB connection
	err := db.Client.Ping(ctx, nil)
	dbStatus := "connected"
	if err != nil {
		log.Printf("MongoDB health check failed: %v", err)
		dbStatus = "disconnected"
	}

	// Check active connections
	activeConnections := len(hub.clients)
	activeMeetings := len(hub.meetings)

	sendSuccessResponse(w, map[string]interface{}{
		"status":            "ok",
		"database":          dbStatus,
		"activeConnections": activeConnections,
		"activeMeetings":    activeMeetings,
		"timestamp":         time.Now().Format(time.RFC3339),
		"version":           "1.0.0",
	})
}

func registerHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Enhanced validation
	if strings.TrimSpace(req.Name) == "" {
		sendErrorResponse(w, "Name is required", http.StatusBadRequest)
		return
	}
	if !validateEmail(req.Email) {
		sendErrorResponse(w, "Valid email is required", http.StatusBadRequest)
		return
	}
	if err := validatePassword(req.Password); err != nil {
		sendErrorResponse(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Clean inputs
	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	// Check if email exists
	var existingUser User
	err := db.Users.FindOne(context.Background(), bson.M{"email": req.Email}).Decode(&existingUser)
	if err == nil {
		sendErrorResponse(w, "Email already in use", http.StatusConflict)
		return
	} else if err != mongo.ErrNoDocuments {
		log.Printf("Database error during email check: %v", err)
		sendErrorResponse(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("Error hashing password: %v", err)
		sendErrorResponse(w, "Error processing password", http.StatusInternalServerError)
		return
	}

	// Create user
	userID := uuid.New().String()
	now := time.Now()
	user := User{
		ID:        userID,
		Name:      req.Name,
		Email:     req.Email,
		Password:  string(hashedPassword),
		CreatedAt: now,
		UpdatedAt: now,
	}

	_, err = db.Users.InsertOne(context.Background(), user)
	if err != nil {
		log.Printf("Error creating user: %v", err)
		sendErrorResponse(w, "Error creating user", http.StatusInternalServerError)
		return
	}

	token := fmt.Sprintf("token_%s", userID)
	setSessionCookie(w, token)

	sendSuccessResponse(w, map[string]interface{}{
		"user": map[string]interface{}{
			"id":        user.ID,
			"name":      user.Name,
			"email":     user.Email,
			"createdAt": user.CreatedAt,
		},
		"token": token,
	})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if !validateEmail(req.Email) || req.Password == "" {
		sendErrorResponse(w, "Valid email and password are required", http.StatusBadRequest)
		return
	}

	// Clean email
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	var user User
	err := db.Users.FindOne(context.Background(), bson.M{"email": req.Email}).Decode(&user)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			sendErrorResponse(w, "Invalid email or password", http.StatusUnauthorized)
		} else {
			log.Printf("Database error during login: %v", err)
			sendErrorResponse(w, "Database error", http.StatusInternalServerError)
		}
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password))
	if err != nil {
		sendErrorResponse(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	// Update last login time
	db.Users.UpdateOne(
		context.Background(),
		bson.M{"_id": user.ID},
		bson.M{"$set": bson.M{"updatedAt": time.Now()}},
	)

	token := fmt.Sprintf("token_%s", user.ID)
	setSessionCookie(w, token)

	sendSuccessResponse(w, map[string]interface{}{
		"user": map[string]interface{}{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
		},
		"token": token,
	})
}

func logoutHandler(w http.ResponseWriter, r *http.Request) {
	clearSessionCookie(w)
	sendSuccessResponse(w, map[string]string{"message": "Logged out successfully"})
}

func createMeetingHandler(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromToken(r)
	if userID == "" {
		sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Title           string `json:"title"`
		Description     string `json:"description,omitempty"`
		ScheduledFor    string `json:"scheduledFor,omitempty"`
		IsPrivate       bool   `json:"isPrivate"`
		MaxParticipants int    `json:"maxParticipants,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Title) == "" {
		sendErrorResponse(w, "Meeting title is required", http.StatusBadRequest)
		return
	}

	// Set default max participants if not provided
	if req.MaxParticipants <= 0 {
		req.MaxParticipants = 50
	} else if req.MaxParticipants > 100 {
		req.MaxParticipants = 100 // Cap at 100 participants
	}

	meetingID := uuid.New().String()
	now := time.Now()
	meeting := Meeting{
		ID:              meetingID,
		Title:           strings.TrimSpace(req.Title),
		Description:     strings.TrimSpace(req.Description),
		CreatedBy:       userID,
		ScheduledFor:    req.ScheduledFor,
		CreatedAt:       now,
		UpdatedAt:       now,
		IsPrivate:       req.IsPrivate,
		IsActive:        true,
		MaxParticipants: req.MaxParticipants,
	}

	_, err := db.Meetings.InsertOne(context.Background(), meeting)
	if err != nil {
		log.Printf("Error creating meeting: %v", err)
		sendErrorResponse(w, "Error creating meeting", http.StatusInternalServerError)
		return
	}

	sendSuccessResponse(w, meeting)
}

// Continue with other handlers...
// (The rest of the handlers would follow similar patterns with enhanced validation and error handling)

func getUserIDFromToken(r *http.Request) string {
	cookie, err := r.Cookie(CookieName)
	if err != nil {
		return ""
	}
	token := cookie.Value
	// Example: token format is "token_<userID>"
	if strings.HasPrefix(token, "token_") {
		return strings.TrimPrefix(token, "token_")
	}
	return ""
}

func websocketHandler(w http.ResponseWriter, r *http.Request) {
	// Upgrade HTTP connection to WebSocket
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	// Example: simple echo loop (replace with your logic)
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}
		if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			break
		}
	}
}

func getMeetingsHandler(w http.ResponseWriter, r *http.Request) {
	// Example: fetch all meetings from the database
	cursor, err := db.Meetings.Find(context.Background(), bson.M{})
	if err != nil {
		sendErrorResponse(w, "Failed to fetch meetings", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(context.Background())

	var meetings []Meeting
	if err := cursor.All(context.Background(), &meetings); err != nil {
		sendErrorResponse(w, "Failed to parse meetings", http.StatusInternalServerError)
		return
	}

	sendSuccessResponse(w, meetings)
}

func getMeetingHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	meetingID := vars["id"]

	var meeting Meeting
	err := db.Meetings.FindOne(context.Background(), bson.M{"_id": meetingID}).Decode(&meeting)
	if err != nil {
		sendErrorResponse(w, "Meeting not found", http.StatusNotFound)
		return
	}

	sendSuccessResponse(w, meeting)
}

func notifyJoinHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	meetingID := vars["id"]
	userID := getUserIDFromToken(r)
	if userID == "" {
		sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Example: add participant to meeting (expand as needed)
	var req struct {
		UserName string `json:"userName"`
		PeerID   string `json:"peerId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	participant := Participant{
		ID:         uuid.New().String(),
		MeetingID:  meetingID,
		UserID:     userID,
		UserName:   req.UserName,
		PeerID:     req.PeerID,
		IsHost:     false,
		JoinedAt:   time.Now(),
		LastActive: time.Now(),
	}

	_, err := db.Participants.InsertOne(context.Background(), participant)
	if err != nil {
		sendErrorResponse(w, "Failed to join meeting", http.StatusInternalServerError)
		return
	}

	sendSuccessResponse(w, participant)
}

func getParticipantsHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	meetingID := vars["id"]

	cursor, err := db.Participants.Find(context.Background(), bson.M{"meetingId": meetingID})
	if err != nil {
		sendErrorResponse(w, "Failed to fetch participants", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(context.Background())

	var participants []Participant
	if err := cursor.All(context.Background(), &participants); err != nil {
		sendErrorResponse(w, "Failed to parse participants", http.StatusInternalServerError)
		return
	}

	sendSuccessResponse(w, participants)
}

func updateParticipantHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	meetingID := vars["id"]
	userID := getUserIDFromToken(r)
	if userID == "" {
		sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		IsAudioEnabled  bool `json:"isAudioEnabled"`
		IsVideoEnabled  bool `json:"isVideoEnabled"`
		IsScreenSharing bool `json:"isScreenSharing"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	update := bson.M{
		"$set": bson.M{
			"isAudioEnabled":  req.IsAudioEnabled,
			"isVideoEnabled":  req.IsVideoEnabled,
			"isScreenSharing": req.IsScreenSharing,
			"lastActive":      time.Now(),
		},
	}

	_, err := db.Participants.UpdateOne(
		context.Background(),
		bson.M{"meetingId": meetingID, "userId": userID},
		update,
	)
	if err != nil {
		sendErrorResponse(w, "Failed to update participant", http.StatusInternalServerError)
		return
	}

	sendSuccessResponse(w, map[string]string{"message": "Participant updated successfully"})
}

func main() {
	// Initialize MongoDB with retry logic
	if err := initMongoDB(); err != nil {
		log.Fatalf("Failed to initialize MongoDB: %v", err)
	}
	defer db.CloseDB()

	// Start WebSocket hub
	go hub.run()

	// Create router
	r := mux.NewRouter()

	// Apply middleware
	r.Use(loggingMiddleware)
	r.Use(corsMiddleware)
	r.Use(rateLimitMiddleware(100)) // 100 requests per minute per IP

	// API routes
	api := r.PathPrefix("/api").Subrouter()

	// Auth routes
	api.HandleFunc("/auth/register", registerHandler).Methods("POST", "OPTIONS")
	api.HandleFunc("/auth/login", loginHandler).Methods("POST", "OPTIONS")
	api.HandleFunc("/auth/logout", logoutHandler).Methods("POST", "OPTIONS")

	// Meeting routes
	api.HandleFunc("/meetings", createMeetingHandler).Methods("POST", "OPTIONS")
	api.HandleFunc("/meetings", getMeetingsHandler).Methods("GET", "OPTIONS")
	api.HandleFunc("/meetings/{id}", getMeetingHandler).Methods("GET", "OPTIONS")
	api.HandleFunc("/meetings/{id}/join", notifyJoinHandler).Methods("POST", "OPTIONS")
	api.HandleFunc("/meetings/{id}/participants", getParticipantsHandler).Methods("GET", "OPTIONS")
	api.HandleFunc("/meetings/{id}/participants", updateParticipantHandler).Methods("PUT", "PATCH", "OPTIONS")

	// WebSocket endpoint
	api.HandleFunc("/ws/{meetingId}", websocketHandler).Methods("GET")

	// Health check endpoints
	api.HandleFunc("/health", healthCheckHandler).Methods("GET", "OPTIONS")
	r.HandleFunc("/health", healthCheckHandler).Methods("GET", "OPTIONS")
	r.HandleFunc("/", healthCheckHandler).Methods("GET", "OPTIONS")

	// Additional CORS setup
	c := cors.New(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"},
		ExposedHeaders:   []string{"Content-Type", "Authorization", "Set-Cookie"},
		AllowCredentials: true,
		MaxAge:           300,
		Debug:            false,
	})

	handler := c.Handler(r)

	// Determine port
	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultPort
	}

	// Create server with timeouts
	server := &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Create channel for shutdown signals
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// Start server
	go func() {
		log.Printf("Server starting on port %s", port)
		log.Printf("Allowed origins: %v", allowedOrigins)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	<-quit
	log.Println("Shutting down server...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exiting")
}