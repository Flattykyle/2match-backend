import { Router } from 'express'
import {
  reportUser,
  getMyReports,
  getAllReports,
  updateReportStatus,
  deleteReport,
} from '../controllers/reportController'
import { authenticate } from '../middleware/auth'

const router = Router()

// All routes require authentication
router.use(authenticate)

// Report a user
router.post('/', reportUser)

// Get my submitted reports
router.get('/my-reports', getMyReports)

// Get all reports (admin)
router.get('/all', getAllReports)

// Update report status (admin)
router.put('/:reportId', updateReportStatus)

// Delete a report
router.delete('/:reportId', deleteReport)

export default router
