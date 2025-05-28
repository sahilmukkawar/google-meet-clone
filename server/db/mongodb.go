package db

import (
	"context"
	"log"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

var (
	Client     *mongo.Client
	Database   *mongo.Database
	Users      *mongo.Collection
	Meetings   *mongo.Collection
)

// ConnectDB establishes connection to MongoDB with proper configuration
func ConnectDB() error {
	// Get MongoDB URI from environment variable
	mongoURI := os.Getenv("MONGODB_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://localhost:27017" // Default local URI
	}

	// Configure client options
	clientOptions := options.Client().
		ApplyURI(mongoURI).
		SetMaxPoolSize(100).
		SetMinPoolSize(10).
		SetMaxConnIdleTime(5 * time.Minute).
		SetConnectTimeout(10 * time.Second).
		SetServerSelectionTimeout(5 * time.Second).
		SetRetryWrites(true).
		SetRetryReads(true)

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Connect to MongoDB
	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return err
	}

	// Ping the database to verify connection
	if err := client.Ping(ctx, readpref.Primary()); err != nil {
		return err
	}

	// Set global variables
	Client = client
	Database = client.Database("video_meeting_app")
	Users = Database.Collection("users")
	Meetings = Database.Collection("meetings")

	// Create indexes
	if err := createIndexes(ctx); err != nil {
		log.Printf("Warning: Failed to create indexes: %v", err)
	}

	log.Println("Connected to MongoDB successfully")
	return nil
}

// createIndexes creates necessary indexes for collections
func createIndexes(ctx context.Context) error {
	// Create unique index on email field for users
	_, err := Users.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    map[string]interface{}{"email": 1},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		return err
	}

	// Create index on createdBy field for meetings
	_, err = Meetings.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: map[string]interface{}{"createdBy": 1},
	})
	if err != nil {
		return err
	}

	// Create index on scheduledFor field for meetings
	_, err = Meetings.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: map[string]interface{}{"scheduledFor": 1},
	})
	if err != nil {
		return err
	}

	return nil
}

// CloseDB closes the MongoDB connection
func CloseDB() {
	if Client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := Client.Disconnect(ctx); err != nil {
			log.Printf("Error disconnecting from MongoDB: %v", err)
		}
	}
}

// IsConnected checks if the database connection is alive
func IsConnected() bool {
	if Client == nil {
		return false
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := Client.Ping(ctx, nil)
	return err == nil
} 