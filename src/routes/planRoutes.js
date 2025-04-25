const express = require("express");
const {
  createPlan,
  getPlan,
  deletePlan,
  patchPlan,
  deleteChild
} = require("../controllers/planController");
const authorized = require("../middleware/auth");
const router = express.Router();

router.post("/", authorized(), createPlan);
router.get("/:id", authorized(), getPlan);
router.delete("/:id", authorized(), deletePlan);
router.patch("/:id", authorized(), patchPlan);
router.delete("/:planId/children/:childId", authorized(), deleteChild);

module.exports = router;
