/**
 * What happens to what the camera sees. Kept next to the camera, where the question comes up.
 * If the app ever sends or stores anything new, this text has to change with it.
 */
export function PrivacyNote() {
  return (
    <section className="privacy" aria-labelledby="privacy-title">
      <h3 id="privacy-title" className="privacy__title">
        Privacy
      </h3>
      <ul className="privacy__list">
        <li>
          <strong>Everything happens on this device.</strong> The camera image is checked in your
          browser and then thrown away. No video or photos are recorded, saved or uploaded.
        </li>
        <li>
          <strong>Only numbers are kept</strong>, in this browser: your sessions, settings and
          calibration (head angles and posture measurements). There’s no account and no tracking.
        </li>
        <li>
          The first time you use the camera, the detection software is downloaded from jsDelivr and
          Google. Those requests only fetch files; nothing from the camera is sent.
        </li>
      </ul>
    </section>
  )
}
