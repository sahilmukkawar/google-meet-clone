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
}

// Response wrapper for API responses
type Response struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
}

func main() {
	// Connect to MongoDB
	if err := db.ConnectDB(); err != nil {
		log.Fatal("Failed to connect to MongoDB:", err)
	}
	defer db.CloseDB()

	// Create router
	r := mux.NewRouter()
	
	// API routes
	api := r.PathPrefix("/api").Subrouter()
	
	// Auth routes
	api.HandleFunc("/auth/register", registerHandler).Methods("POST", "OPTIONS")
	api.HandleFunc("/auth/login", loginHandler).Methods("POST", "OPTIONS")
	
	// Meeting routes
	api.HandleFunc("/meetings", createMeetingHandler).Methods("POST", "OPTIONS")
	api.HandleFunc("/meetings", getMeetingsHandler).Methods("GET", "OPTIONS")
	api.HandleFunc("/meetings/{id}", getMeetingHandler).Methods("GET", "OPTIONS")
	
	// CORS setup
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	})
	
	// Apply CORS middleware to router
	handler := c.Handler(r)
	
	// Determine port
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	
	// Start server
	log.Printf("Server starting on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, handler))
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
		sendErrorResponse(w, "Database error", http.StatusInternalServerError)
		return
	}
	
	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
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
	}
	
	_, err := db.Meetings.InsertOne(context.Background(), meeting)
	if err != nil {
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
		sendErrorResponse(w, "Error fetching meetings", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(context.Background())
	
	var meetings []Meeting
	if err = cursor.All(context.Background(), &meetings); err != nil {
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
	
	vars := mux.Vars(r)
	meetingID := vars["id"]
	
	var meeting Meeting
	err := db.Meetings.FindOne(context.Background(), bson.M{"_id": meetingID}).Decode(&meeting)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			sendErrorResponse(w, "Meeting not found", http.StatusNotFound)
		} else {
			sendErrorResponse(w, "Database error", http.StatusInternalServerError)
		}
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

func sendSuccessResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	
	response := Response{
		Success: true,
		Data:    data,
	}
	
	json.NewEncoder(w).Encode(response)
}

func sendErrorResponse(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	
	response := Response{
		Success: false,
		Message: message,
	}
	
	json.NewEncoder(w).Encode(response)
}