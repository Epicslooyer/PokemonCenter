# Pokémon Center Stock Checker

Backend to monitor Pokemon Center stock and track queue positions

## Features

- **Stock Monitoring**: Checks elite trainer boxes and booster packs on the Pokémon Center website
- **Restock Notifications**: Detects when products change from out-of-stock to in-stock
- **Queue Detection**: Identifies when the site is in queue and estimates position
- **Database Integration**: Persists product data in MongoDB for historical tracking
- **REST API**: Simple endpoints to trigger checks and retrieve current stock statuses
- **Web Interface**: Currently being worked on

## Project Structure

```
PokemonCenter/
├── server/                  # Express.js backend
│   ├── server.js            # Main API server
│   ├── db.js                # MongoDB connection and data operations
│   ├── package.json         # Server dependencies
│   └── .env                 # Server environment variables
│
└── frontend/
    └── PokeScrape/          
```

## Setup

### Prerequisites

- Node.js (v14+ recommended)
- MongoDB (local or Atlas)
- NPM or Yarn

### Server Setup

1. Navigate to the server directory:
   ```
   cd server
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file:
   ```
   # For local MongoDB
   DB_LINK=mongodb://localhost:27017
   
   # For MongoDB Atlas
   # DB_LINK=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority
   ```

4. Start the server:
   ```
   npm start
   ```

The server will start on http://localhost:3000 by default.

### Frontend Setup

1. Navigate to the frontend directory:
   ```
   cd frontend/PokeScrape
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```

The frontend will be available at http://localhost:5173 (or the port indicated in your terminal).

## API Endpoints

- **GET /check-stock**: Triggers a stock check and returns results including notifications for newly in-stock items, all products found, and queue status if applicable.
- **GET /current-states**: Returns the current state of all products in the database.

## Database

The application uses MongoDB to store product states with the following structure:

- Database: `stock-checker`
- Collection: `stock-states`
- Document structure:
  ```json
  {
    "mpn": "123-45678",
    "name": "Product Name",
    "inStock": true/false,
    "url": "https://www.pokemoncenter.com/product/...",
    "lastSeenOn": "https://www.pokemoncenter.com/category/...",
    "lastChecked": "2023-01-01T12:00:00Z"
  }
  ```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
