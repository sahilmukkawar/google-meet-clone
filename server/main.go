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

// User represents a user in the application
type User struct {
	ID       string `json:"id" bson:"_id"`
	Name     string `json:"name" bson:"name"`
	Email    string `json:"email" bson:"email"`
	Password string `json:"-" bson:"password"`
}

// Meeting represents a video meeting
type Meeting struct {
	ID          string    `json:"id" bson:"_id"`
	Title       string    `json:"title" bson:"title"`
	CreatedBy   string    `json:"createdBy" bson:"createdBy"`
	ScheduledFor string    `json:"scheduledFor,omitempty" bson:"scheduledFor,omitempty"`
	CreatedAt   time.Time `json:"createdAt" bson:"createdAt"`
	IsPrivate   bool      `json:"isPrivate" bson:"isPrivate"`
}

// Response wrapper for API responses
type Response struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// Middleware to ensure JSON responses
func jsonMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		next.ServeHTTP(w, r)
	})
}

func main() {
	// Connect to MongoDB
	if err := db.ConnectDB(); err != nil {
		log.Fatal("Failed to connect to MongoDB:", err)
	}
	defer db.CloseDB()

	// Create router
	r := mux.NewRouter()
	
	// Apply JSON middleware to all routes
	r.Use(jsonMiddleware)
	
	// API routes
	api := r.PathPrefix("/api").Subrouter()
	
	// Auth routes
	api.HandleFunc("/auth/register", registerHandler).Methods("POST", "OPTIONS")
	api.HandleFunc("/auth/login", loginHandler).Methods("POST", "OPTIONS")
	
	// Meeting routes
	api.HandleFunc("/meetings", createMeetingHandler).Methods("POST", "OPTIONS")
	api.HandleFunc("/meetings", getMeetingsHandler).Methods("GET", "OPTIONS")
	api.HandleFunc("/meetings/{id}", getMeetingHandler).Methods("GET", "OPTIONS")
	
	// Health check endpoint
	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}).Methods("GET")
	
	// CORS setup with more specific options
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"},
		ExposedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           300,
		Debug:            true,
	})
	
	// Apply CORS middleware to router
	handler := c.Handler(r)
	
	// Determine port
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	
	// Create server with timeouts
	server := &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	
	// Start server
	log.Printf("Server starting on port %s", port)
	log.Fatal(server.ListenAndServe())
}

func sendJSONResponse(w http.ResponseWriter, statusCode int, response Response) {
	// Ensure content type is set
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With")
	
	// Handle preflight requests
	if statusCode == http.StatusOK {
		w.WriteHeader(statusCode)
	}
	
	// Marshal the response
	jsonData, err := json.Marshal(response)
	if err != nil {
		log.Printf("Error marshaling response: %v", err)
		// Send a fallback error response
		fallbackResponse := Response{
			Success: false,
			Error:   "Internal server error",
		}
		fallbackData, _ := json.Marshal(fallbackResponse)
		w.Write(fallbackData)
		return
	}
	
	// Write the response
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

// Authentication Handlers

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
	
	// Check if email already exists
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
	
	// Create new user
	userID := uuid.New().String()
	user := User{
		ID:       userID,
		Name:     req.Name,
		Email:    req.Email,
		Password: string(hashedPassword),
	}
	
	// Insert user into database
	_, err = db.Users.InsertOne(context.Background(), user)
	if err != nil {
		log.Printf("Error creating user: %v", err)
		sendErrorResponse(w, "Error creating user", http.StatusInternalServerError)
		return
	}
	
	// Generate token
	token := fmt.Sprintf("token_%s", userID)
	
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
	
	// Find user by email
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
	
	// Check password
	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password))
	if err != nil {
		sendErrorResponse(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}
	
	// Generate token
	token := fmt.Sprintf("token_%s", user.ID)
	
	sendSuccessResponse(w, map[string]interface{}{
		"user": map[string]string{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
		},
		"token": token,
	})
}

// Meeting Handlers

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
	
	sendSuccessResponse(w, map[string]string{
		"id": meetingID,
	})
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
	
	// Check if user has access to the meeting
	if meeting.IsPrivate && meeting.CreatedBy != userID {
		sendErrorResponse(w, "You do not have access to this meeting", http.StatusForbidden)
		return
	}
	
	sendSuccessResponse(w, meeting)
}

// Helper Functions

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