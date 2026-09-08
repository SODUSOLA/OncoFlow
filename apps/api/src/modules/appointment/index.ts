export { Appointment, AppointmentParticipant, type AppointmentData, type AppointmentStatus, canConfirmOnDay, isAfter2pmNigeria } from "./entities/index.js";
export { AppointmentRepository, AppointmentParticipantRepository, TransferRequestRepository } from "./repository.js";
export { AppointmentService, TransferRequestService } from "./service.js";
// Deliberately NOT re-exporting routes here (same reasoning as audit/index.ts and
// clinical-metrics/index.ts): routes.ts -> controller.ts -> services/ConsultationService.ts ->
// messaging/index.ts -> messaging/service.ts imports AppointmentRepository from THIS barrel,
// so exporting routes here would close a cycle back through this very file. app.ts imports
// appointmentRoutes directly from ./routes.js instead.
