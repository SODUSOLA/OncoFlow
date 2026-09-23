import { enqueueEmail } from "../../../lib/email-queue.js";

// Emails the patient once Admin confirms or reassigns their facility, the last onboarding step.
export async function sendRegistrationConfirmedEmail(
  email: string,
  patientName: string,
  uniquePatientId: string,
  facilityName: string,
): Promise<void> {
  const html = `
    <h2>Your OncoFlow registration is confirmed</h2>
    <p>Hello ${patientName},</p>
    <p>Your care team has confirmed your details and treatment facility. Your registration is now complete.</p>
    <p><strong>Unique Patient ID:</strong> ${uniquePatientId}<br/>
       <strong>Facility:</strong> ${facilityName}</p>
    <p>Keep your Unique Patient ID somewhere safe — you'll be asked for it at appointments.</p>
  `;

  await enqueueEmail(email, "OncoFlow Limited — Registration confirmed", html);
}
