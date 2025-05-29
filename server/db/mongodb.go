package db

import (
	"context"
	"log"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

var (
	Client     *mongo.Client
	Database   *mongo.Database
	Users      *mongo.Collection
	Meetings   *mongo.Collection
	Participants *mongo.Collection
)

// ConnectDB establishes connection to MongoDB with proper configuration
func ConnectDB() error {
	// Get MongoDB URI from environment variable
	mongoURI := os.Getenv("MONGODB_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://localhost:27017" // Default local URI
	}

	// Configure client options with improved settings
	clientOptions := options.Client().
		ApplyURI(mongoURI).
		SetMaxPoolSize(200).                    // Increased pool size
		SetMinPoolSize(20).                     // Increased min pool size
		SetMaxConnIdleTime(10 * time.Minute).   // Increased idle time
		SetConnectTimeout(15 * time.Second).    // Increased connect timeout
		SetServerSelectionTimeout(10 * time.Second). // Increased server selection timeout
		SetRetryWrites(true).
		SetRetryReads(true).
		SetHeartbeatInterval(10 * time.Second). // Added heartbeat
		SetMaxConnecting(50)                    // Limit concurrent connections

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
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
	Participants = Database.Collection("participants")

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
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		return err
	}

	// Create compound index on meeting and participant for faster lookups
	_, err = Participants.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{
			{Key: "meetingId", Value: 1},
			{Key: "userId", Value: 1},
		},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		return err
	}

	// Create TTL index for participants to auto-remove after 24 hours
	_, err = Participants.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "lastActive", Value: 1}},
		Options: options.Index().SetExpireAfterSeconds(86400), // 24 hours
	})
	if err != nil {
		return err
	}

	// Create index on createdBy field for meetings
	_, err = Meetings.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "createdBy", Value: 1}},
	})
	if err != nil {
		return err
	}

	// Create index on scheduledFor field for meetings
	_, err = Meetings.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "scheduledFor", Value: 1}},
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