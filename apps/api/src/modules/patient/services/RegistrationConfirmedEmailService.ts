import { enqueueEmail } from "../../../lib/email-queue.js";

// Request #5's "mail of confirmation" — sent once a Regional Admin confirms (or reassigns) the
// facility on an already-live patient record, which is the last step of onboarding now that
// the record itself is created automatically at email verification.
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

  await enqueueEmail(email, "OncoFlow — Registration confirmed", html);
}
