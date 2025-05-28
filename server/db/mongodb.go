package db

import (
	"context"
	"log"
	"time"

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
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// MongoDB connection string
	uri := "mongodb+srv://mukkawarsahil99:e2sqKmvN07qUMfhG@cluster0.bayih5k.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
	
	// Connect to MongoDB
	clientOptions := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return err
	}

	// Ping the database
	err = client.Ping(ctx, nil)
	if err != nil {
		return err
	}

	// Set up database and collections
	Client = client
	Database = client.Database("video_meeting_app")
	Users = Database.Collection("users")
	Meetings = Database.Collection("meetings")

	log.Println("Connected to MongoDB!")
	return nil
}

func CloseDB() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	
	return Client.Disconnect(ctx)
} 