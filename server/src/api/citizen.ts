import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { ah, parse, HttpError } from "../middleware/http.ts";
import { ai } from "../services/aiClient.ts";
import { audit } from "../services/audit.ts";
import * as Z from "../services/citizen.ts";

/** Resident app. Open to every signed-in role; each person only ever reads and writes their own tally. */
export const citizenRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const MAGIC: number[][] = [[0xff, 0xd8, 0xff], [0x89, 0x50, 0x4e, 0x47], [0x52, 0x49, 0x46, 0x46]];

citizenRouter.get("/citizen/catalogue", ah(async (_req, res) => { res.json(Z.catalogue()); }));
citizenRouter.get("/citizen/me", ah(async (req, res) => { res.json(await Z.profile(req.user!.id)); }));
citizenRouter.get("/citizen/leaderboard", ah(async (req, res) => {
  res.json(await Z.leaderboard(req.query.range === "all" ? "all" : "week", req.user!.id));
}));

// "Play the demo" starts here: the demo resident goes back to 45 points and the neighbours' week is refreshed.
citizenRouter.post("/citizen/demo/reset", ah(async (req, res) => {
  const out = await Z.resetDemo(req.user!);
  await audit(req, "citizen.demo_reset", "user", req.user!.id);
  res.json(out);
}));

// Photo -> best guesses. Nothing is stored and no points are given until the person confirms the item.
citizenRouter.post("/citizen/scan", upload.single("file"), ah(async (req, res) => {
  const f = req.file;
  if (!f) throw new HttpError(400, "file is required");
  if (!MAGIC.some((sig) => sig.every((b, i) => f.buffer[i] === b))) throw new HttpError(415, "Only JPEG, PNG or WebP images are accepted");
  let out: any;
  try {
    out = await ai.classifyImage({ images: [f.buffer.toString("base64")] });
  } catch (e) {
    // The photo model is optional (large download). Without it the app falls back to choosing the item by hand.
    if (e instanceof HttpError && (e.status === 503 || e.status === 502)) return res.json({ mode: "manual", reason: "Photo recognition is not running right now." });
    throw e;
  }
  const photo = out.photos[0];
  const items = Z.catalogue().items;
  const guesses = photo.top.map((g: any) => ({ item: items.find((i) => i.key === g.label), p: g.p })).filter((g: any) => g.item);
  res.json({ mode: "photo", model: out.model, guesses, unsure: (guesses[0]?.p ?? 0) < 0.5 });
}));

citizenRouter.post("/citizen/log", ah(async (req, res) => {
  const b = parse(z.object({ item: z.string().max(60), method: z.enum(["photo", "picked"]), confidence: z.number().min(0).max(1).optional() }), req.body);
  res.status(201).json(await Z.logScan(req.user!.id, b.item, b.method, b.confidence));
}));
citizenRouter.post("/citizen/resin", ah(async (req, res) => {
  const b = parse(z.object({ code: z.number().int().min(1).max(7) }), req.body);
  res.json(await Z.logResin(req.user!.id, b.code));
}));
citizenRouter.post("/citizen/guide", ah(async (req, res) => {
  const b = parse(z.object({ slug: z.string().regex(/^[a-z0-9-]{3,60}$/) }), req.body);
  res.json(await Z.logGuide(req.user!.id, b.slug));
}));
