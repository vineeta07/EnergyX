"""Multi-item detector (ml/inference/detect.py). The model itself needs ultralytics + torch, which the
light CI install leaves out; those checks skip there and run wherever the full requirements are installed."""
import importlib.util
import unittest
from pathlib import Path
from unittest import mock

from ml.inference import detect

HAS_YOLO = importlib.util.find_spec("ultralytics") is not None and detect.MODEL_PATH.exists()


class DetectorTest(unittest.TestCase):
    def test_missing_weights_raise_unavailable_not_crash(self):
        with mock.patch.object(detect, "MODEL_PATH", Path("/nonexistent/best.pt")), mock.patch.object(detect, "_model", None):
            with self.assertRaises(detect.DetectorUnavailable):
                detect.detect([b"x"])

    @unittest.skipUnless(HAS_YOLO, "ultralytics or best.pt not available")
    def test_checkpoint_classes(self):
        detect._load()
        self.assertEqual(sorted(detect.info()["classes"]), ["Crinkly Plastic", "Deposit_Recycle", "Green_bin", "Metallic Wrapping", "Recycle"])

    @unittest.skipUnless(HAS_YOLO, "ultralytics or best.pt not available")
    def test_boxes_are_fractions_of_the_image(self):
        import io
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (320, 240), (200, 200, 200)).save(buf, "JPEG")
        out = detect.detect([buf.getvalue()])[0]
        self.assertEqual((out["width"], out["height"]), (320, 240))
        for d in out["detections"]:
            self.assertTrue(all(0 <= v <= 1 for v in d["box"]))


if __name__ == "__main__":
    unittest.main()
