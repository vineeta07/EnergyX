import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { ah, parse, HttpError } from "../middleware/http.ts";
import { ai } from "../services/aiClient.ts";
import { audit } from "../services/audit.ts";
import * as Z from "../services/citizen.ts";
import { requireRole } from "../middleware/auth.ts";
import { getObject } from "../services/storage.ts";

/** Resident app. Residents only (operators, admin included, never see it); each person only ever reads and writes their own tally. */
export const citizenRouter = Router();
citizenRouter.use("/citizen", (req, _res, next) => next(req.user?.role === "citizen" ? undefined : new HttpError(403, "The resident app is for resident accounts")));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const MAGIC: number[][] = [[0xff, 0xd8, 0xff], [0x89, 0x50, 0x4e, 0x47], [0x52, 0x49, 0x46, 0x46]];
const EXT = ["jpg", "png", "webp"];

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

// ---- whole-bag check: every item in one photo, from the YOLOv8 detector in the AI service
citizenRouter.post("/citizen/bag", upload.single("file"), ah(async (req, res) => {
  const f = req.file;
  if (!f) throw new HttpError(400, "file is required");
  if (!MAGIC.some((sig) => sig.every((b, i) => f.buffer[i] === b))) throw new HttpError(415, "Only JPEG, PNG or WebP images are accepted");
  let out: any;
  try {
    out = await ai.detectWaste({ images: [f.buffer.toString("base64")] });
  } catch (e) {
    // The detector needs the ultralytics package and an 87 MB weights file; without them the screen says so and points to the single-item scan.
    if (e instanceof HttpError && (e.status === 503 || e.status === 502)) return res.json({ mode: "unavailable", reason: "The bag check is not running right now." });
    throw e;
  }
  const result = Z.bagResult(out.photos[0]);
  const reward = result.detections.length ? await Z.logBag(req.user!.id, result.detections.length, result.detections[0].guide.key) : null;
  res.json({ mode: "photo", model: out.model, ...result, reward });
}));

// ---- daily quiz
citizenRouter.get("/citizen/quiz", ah(async (req, res) => { res.json(await Z.quiz(req.user!.id)); }));
citizenRouter.post("/citizen/quiz", ah(async (req, res) => {
  const b = parse(z.object({ answers: z.record(z.string().max(60), z.enum(["blue", "green", "red", "donate"])) }), req.body);
  res.json(await Z.submitQuiz(req.user!.id, b.answers));
}));

// ---- drop-off points near the person's area or location
citizenRouter.get("/citizen/dropoff", ah(async (req, res) => {
  const q = parse(z.object({ zone: z.string().max(80).optional(), lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional() }), req.query);
  res.json(await Z.dropoffs(q));
}));

// ---- problem reports: each one raises an alert the operators see on their Alerts screen
citizenRouter.get("/citizen/reports", ah(async (req, res) => { res.json(await Z.myReports(req.user!.id)); }));
citizenRouter.post("/citizen/reports", upload.single("file"), ah(async (req, res) => {
  const num = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().optional());
  const b = parse(z.object({
    kind: z.enum(Object.keys(Z.REPORT_KINDS) as [Z.ReportKind, ...Z.ReportKind[]]),
    zone: z.string().max(80).optional(), lat: num, lng: num, note: z.string().max(500).optional(),
  }), req.body);
  const f = req.file;
  let photo: { body: Buffer; ext: string; type: string } | undefined;
  if (f) {
    const i = MAGIC.findIndex((sig) => sig.every((x, j) => f.buffer[j] === x));
    if (i < 0) throw new HttpError(415, "Only JPEG, PNG or WebP images are accepted");
    photo = { body: f.buffer, ext: EXT[i], type: EXT[i] === "jpg" ? "image/jpeg" : `image/${EXT[i]}` };
  }
  const out = await Z.createReport(req.user!.id, b, photo);
  await audit(req, "citizen.report", "citizen_report", out.report.id, { kind: b.kind });
  res.status(201).json(out);
}));

// Operators open the photo attached to a resident report from their Alerts screen.
citizenRouter.get("/resident-reports/:id/photo", requireRole("hub", "fleet", "facility", "generator") /* admin always passes */, ah(async (req, res) => {
  const key = await Z.reportPhotoKey(Number(req.params.id));
  if (!key) throw new HttpError(404, "No photo for this report");
  // Streamed through the API (S3 or disk) rather than redirected, so the browser needs no bucket CORS rule.
  const body = await getObject(key);
  if (!body) throw new HttpError(404, "No photo for this report");
  res.type(key.split(".").pop() ?? "jpg").send(body);
}));
