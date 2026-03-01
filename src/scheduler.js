import { processDueCheckIns } from "./services/checkinService.js";
import { runInsightSweep } from "./services/insightService.js";

export function startScheduler() {
  setInterval(async () => {
    try {
      await processDueCheckIns();
    } catch (err) {
      console.error("Check-in scheduler error:", err.message);
    }
  }, 60 * 1000);

  setInterval(async () => {
    try {
      await runInsightSweep();
    } catch (err) {
      console.error("Insight scheduler error:", err.message);
    }
  }, 6 * 60 * 60 * 1000);
}
