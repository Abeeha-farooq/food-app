// routes/user.route.js
import express from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { getMyProfile, updateMyProfile } from "../controllers/user.controller.js";

const router = express.Router();

// Every route here requires login
router.use(verifyJWT);

router.get("/me", getMyProfile);
router.put("/me", updateMyProfile);

export default router;
