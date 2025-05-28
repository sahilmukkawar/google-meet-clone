package db

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	Client     *mongo.Client
	Database   *mongo.Database
	Users      *mongo.Collection
	Meetings   *mongo.Collection
)

func ConnectDB() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// MongoDB connection string with explicit SSL/TLS options
	uri := "mongodb+srv://mukkawarsahil99:e2sqKmvN07qUMfhG@cluster0.bayih5k.mongodb.net/video_meeting_app?retryWrites=true&w=majority&ssl=true&tlsAllowInvalidCertificates=false"
	
	// Connect to MongoDB with options
	clientOptions := options.Client().
		ApplyURI(uri).
		SetServerAPIOptions(options.ServerAPI(options.ServerAPIVersion1)).
		SetMaxPoolSize(100).
		SetMinPoolSize(5).
		SetMaxConnIdleTime(5 * time.Minute).
		SetTLSConfig(&tls.Config{
			MinVersion: tls.VersionTLS12,
		})

	// Connect to MongoDB
	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return fmt.Errorf("failed to connect to MongoDB: %v", err)
	}

	// Ping the database with a longer timeout
	pingCtx, pingCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer pingCancel()
	
	err = client.Ping(pingCtx, nil)
	if err != nil {
		return fmt.Errorf("failed to ping MongoDB: %v", err)
	}

	// Set up database and collections
	Client = client
	Database = client.Database("video_meeting_app")
	Users = Database.Collection("users")
	Meetings = Database.Collection("meetings")

	// Create indexes
	createIndexes(ctx)

	log.Println("Connected to MongoDB!")
	return nil
}

func createIndexes(ctx context.Context) {
	// Create unique index on email for users
	userIndexModel := mongo.IndexModel{
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true),
	}
	_, err := Users.Indexes().CreateOne(ctx, userIndexModel)
	if err != nil {
		log.Printf("Error creating user index: %v", err)
	}

	// Create index on createdBy for meetings
	meetingIndexModel := mongo.IndexModel{
		Keys: bson.D{{Key: "createdBy", Value: 1}},
	}
	_, err = Meetings.Indexes().CreateOne(ctx, meetingIndexModel)
	if err != nil {
		log.Printf("Error creating meeting index: %v", err)
	}
}

func CloseDB() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	
	return Client.Disconnect(ctx)
} 