export function AboutPage() {
  return (
    <div className="wrap">
      <section className="page-head">
        <p className="kicker">About</p>
        <h1>
          About <em>Safi</em>
        </h1>
      </section>
      <div className="about section">
        <div>
          <p className="pullquote">Slow down, check, then decide. That habit protects people better than any single rule.</p>
        </div>
        <div className="prose">
          <p>
            Safi is an AI-powered cybersecurity education and preparedness coach designed to help people recognize common digital threats, understand
            why they are risky, and build safer habits through explanation and practice.
          </p>
          <h2>How it works</h2>
          <ul>
            <li>
              <strong>Analyze.</strong> Safi runs basic checks on the message or link you give it, such as urgency, requests for passwords, and unusual
              link features.
            </li>
            <li>
              <strong>Explain.</strong> You get a plain-language Risk Card that says what stood out and why it matters.
            </li>
            <li>
              <strong>Learn and practice.</strong> Short lessons and everyday scenarios help the ideas stick.
            </li>
          </ul>
          <h2>What Safi is not</h2>
          <ul>
            <li>Safi does not visit links or look them up in threat databases. Its checks look only at the text and the shape of an address.</li>
            <li>A result is a set of warning signs, not proof. Safi can be wrong, and it never guarantees that something is safe.</li>
            <li>When in doubt, contact the organization using a phone number or website you already trust.</li>
          </ul>
          <h2>Your privacy</h2>
          <p>Safi does not store the messages, links or screenshots you submit, and it never asks for your passwords or authentication codes.</p>
          <h2>Who it is for</h2>
          <p>
            Safi is built for individuals and communities who want clear, practical digital-safety guidance, and it is designed to grow to help small
            teams and early-stage organizations too.
          </p>
        </div>
      </div>
    </div>
  );
}
