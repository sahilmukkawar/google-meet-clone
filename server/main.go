package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/rs/cors"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"

	"video-meeting-app/db"
)

// Configuration
const (
	DefaultPort = "8080"
	MaxRetries  = 3
	RetryDelay  = 1 * time.Second
	CookieName  = "session_token"
)

// Allowed origins for CORS
var allowedOrigins = []string{
	"https://famous-sprite-14c531.netlify.app",
	"https://google-meet-clone-lovat.vercel.app",
	"http://localhost:5173",
}

// Models
type User struct {
	ID       string `json:"id" bson:"_id"`
	Name     string `json:"name" bson:"name"`
	Email    string `json:"email" bson:"email"`
	Password string `json:"-" bson:"password"`
}

type Meeting struct {
	ID          string    `json:"id" bson:"_id"`
	Title       string    `json:"title" bson:"title"`
	CreatedBy   string    `json:"createdBy" bson:"createdBy"`
	ScheduledFor string    `json:"scheduledFor,omitempty" bson:"scheduledFor,omitempty"`
	CreatedAt   time.Time `json:"createdAt" bson:"createdAt"`
	IsPrivate   bool      `json:"isPrivate" bson:"isPrivate"`
}

type Response struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// Initialize MongoDB connection with retry logic
func initMongoDB() error {
	var err error
	for i := 0; i < MaxRetries; i++ {
		err = db.ConnectDB()
		if err == nil {
			log.Println("Successfully connected to MongoDB")
			return nil
		}
		log.Printf("Failed to connect to MongoDB (attempt %d/%d): %v", i+1, MaxRetries, err)
		if i < MaxRetries-1 {
			time.Sleep(RetryDelay)
		}
	}
	return fmt.Errorf("failed to connect to MongoDB after %d attempts: %v", MaxRetries, err)
}

// Middleware
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		log.Printf("Started %s %s", r.Method, r.URL.Path)
		log.Printf("Request headers: %v", r.Header)
		next.ServeHTTP(w, r)
		log.Printf("Completed %s %s in %v", r.Method, r.URL.Path, time.Since(start))
	})
}

func jsonMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Expose-Headers", "Content-Type, Authorization, Set-Cookie")
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		next.ServeHTTP(w, r)
	})
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
	origin := w.Header().Get("Origin")
	if origin == "" {
		origin = allowedOrigins[0] // Default to first allowed origin
	}

	if isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Type, Authorization, Set-Cookie")
		w.Header().Set("Vary", "Origin")
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
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

// Handlers
func healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	// Check MongoDB connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := db.Client.Ping(ctx, nil)
	if err != nil {
		log.Printf("MongoDB health check failed: %v", err)
		sendErrorResponse(w, "Database connection error", http.StatusServiceUnavailable)
		return
	}

	sendSuccessResponse(w, map[string]interface{}{
		"status":    "ok",
		"database":  "connected",
		"timestamp": time.Now().Format(time.RFC3339),
		"version":   "1.0.0",
	})
}

func registerHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" || req.Email == "" || req.Password == "" {
		sendErrorResponse(w, "Name, email, and password are required", http.StatusBadRequest)
		return
	}

	// Check if email exists
	var existingUser User
	err := db.Users.FindOne(context.Background(), bson.M{"email": req.Email}).Decode(&existingUser)
	if err == nil {
		sendErrorResponse(w, "Email already in use", http.StatusBadRequest)
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
	user := User{
		ID:       userID,
		Name:     req.Name,
		Email:    req.Email,
		Password: string(hashedPassword),
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
		"user": map[string]string{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
		},
		"token": token,
	})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.Password == "" {
		sendErrorResponse(w, "Email and password are required", http.StatusBadRequest)
		return
	}

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

	token := fmt.Sprintf("token_%s", user.ID)
	setSessionCookie(w, token)

	sendSuccessResponse(w, map[string]interface{}{
		"user": map[string]string{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
		},
		"token": token,
	})
}

func logoutHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	clearSessionCookie(w)
	sendSuccessResponse(w, map[string]string{"message": "Logged out successfully"})
}

func createMeetingHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	userID := getUserIDFromToken(r)
	if userID == "" {
		sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Title       string `json:"title"`
		ScheduledFor string `json:"scheduledFor,omitempty"`
		IsPrivate   bool   `json:"isPrivate"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Title == "" {
		sendErrorResponse(w, "Meeting title is required", http.StatusBadRequest)
		return
	}

	meetingID := uuid.New().String()
	meeting := Meeting{
		ID:          meetingID,
		Title:       req.Title,
		CreatedBy:   userID,
		ScheduledFor: req.ScheduledFor,
		CreatedAt:   time.Now(),
		IsPrivate:   req.IsPrivate,
	}

	_, err := db.Meetings.InsertOne(context.Background(), meeting)
	if err != nil {
		log.Printf("Error creating meeting: %v", err)
		sendErrorResponse(w, "Error creating meeting", http.StatusInternalServerError)
		return
	}

	sendSuccessResponse(w, map[string]string{"id": meetingID})
}

func getMeetingsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	userID := getUserIDFromToken(r)
	if userID == "" {
		sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	cursor, err := db.Meetings.Find(context.Background(), bson.M{"createdBy": userID})
	if err != nil {
		log.Printf("Error fetching meetings: %v", err)
		sendErrorResponse(w, "Error fetching meetings", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(context.Background())

	var meetings []Meeting
	if err = cursor.All(context.Background(), &meetings); err != nil {
		log.Printf("Error processing meetings: %v", err)
		sendErrorResponse(w, "Error processing meetings", http.StatusInternalServerError)
		return
	}

	sendSuccessResponse(w, meetings)
}

func getMeetingHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	userID := getUserIDFromToken(r)
	if userID == "" {
		sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	meetingID := vars["id"]

	var meeting Meeting
	err := db.Meetings.FindOne(context.Background(), bson.M{"_id": meetingID}).Decode(&meeting)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			sendErrorResponse(w, "Meeting not found", http.StatusNotFound)
		} else {
			log.Printf("Database error fetching meeting: %v", err)
			sendErrorResponse(w, "Database error", http.StatusInternalServerError)
		}
		return
	}

	if meeting.IsPrivate && meeting.CreatedBy != userID {
		sendErrorResponse(w, "You do not have access to this meeting", http.StatusForbidden)
		return
	}

	sendSuccessResponse(w, meeting)
}

func getUserIDFromToken(r *http.Request) string {
	token := r.Header.Get("Authorization")
	if token == "" {
		return ""
	}

	if len(token) > 7 && token[:7] == "Bearer " {
		token = token[7:]
	}

	if len(token) > 6 && token[:6] == "token_" {
		return token[6:]
	}

	return ""
}

func main() {
	// Initialize MongoDB with retry logic
	if err := initMongoDB(); err != nil {
		log.Fatalf("Failed to initialize MongoDB: %v", err)
	}
	defer db.CloseDB()

	// Create router
	r := mux.NewRouter()

	// Apply middleware
	r.Use(loggingMiddleware)
	r.Use(jsonMiddleware)

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

	// Health check endpoint
	r.HandleFunc("/health", healthCheckHandler).Methods("GET", "OPTIONS")

	// CORS setup
	c := cors.New(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"},
		ExposedHeaders:   []string{"Content-Type", "Authorization", "Set-Cookie"},
		AllowCredentials: true,
		MaxAge:           300,
		Debug:            true,
	})

	// Apply CORS middleware
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

	// Start server with graceful shutdown
	go func() {
		log.Printf("Server starting on port %s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	<-quit

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exiting")
}