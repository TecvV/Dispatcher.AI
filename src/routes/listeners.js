import { Router } from "express";
import { Listener } from "../models/Listener.js";

const router = Router();

router.post("/", async (req, res, next) => {
  try {
    const listener = await Listener.create(req.body);
    res.status(201).json(listener);
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const listeners = await Listener.find({}).sort({ avgRating: -1 });
    res.json(listeners);
  } catch (err) {
    next(err);
  }
});

export default router;
