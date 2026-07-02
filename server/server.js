//Import express
const express = require("express");

//Create an app
const app = express();

// Define a simple route 
app.get("/", (req, res) => {
  res.send("Hello, API is working!");
});

// Start the server
const PORT = 5000; // can use any port like 3000, 4000
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

