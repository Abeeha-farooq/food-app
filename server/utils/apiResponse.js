// utils/apiResponse.js
// ===============================
// Purpose: A consistent shape for every successful response from our API.
//
// Instead of every controller returning res.json({...}) with random shapes,
// they all use res.json(new ApiResponse(200, data, "User created"))
// ===============================

class ApiResponse {
  constructor(statusCode, data, message = "Success") {
    this.statusCode = statusCode;
    this.success = statusCode < 400;        // 2xx/3xx = true, 4xx/5xx = false
    this.message = message;
    this.data = data;
  }
}

export default ApiResponse;