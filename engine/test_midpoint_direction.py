import unittest

from right_to_left_power import classify_weekly_kline_direction


class MidpointDirectionTests(unittest.TestCase):
    def test_bullish_candle_at_midpoint_is_up(self):
        result = classify_weekly_kline_direction(8070, 8215, 7955, 8085)

        self.assertEqual(result["corrected_direction"], "up")
        self.assertFalse(result["is_direction_reversed"])

    def test_bearish_candle_at_midpoint_is_down(self):
        result = classify_weekly_kline_direction(8100, 8215, 7955, 8085)

        self.assertEqual(result["corrected_direction"], "down")
        self.assertFalse(result["is_direction_reversed"])

    def test_flat_candle_at_midpoint_is_neutral(self):
        result = classify_weekly_kline_direction(8085, 8215, 7955, 8085)

        self.assertEqual(result["corrected_direction"], "none")


if __name__ == "__main__":
    unittest.main()
