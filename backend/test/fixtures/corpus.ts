/**
 * Evaluation corpus for Safi's deterministic email detection.
 *
 * All organizations, people, addresses and domains are fictional. Domains end in .example (reserved for
 * documentation), except a few made-up .edu names used for the education fixtures and two well-known
 * link shorteners. The fixtures were written to be realistic, not to suit the current detector.
 *
 * `expected` is a broad, human judgement:
 *   'HIGH RISK'   a clear phishing message that should be flagged as high risk
 *   'SUSPICIOUS+' a subtle threat that should at least be flagged as suspicious (high risk is also fine)
 *   'LOW RISK'    a legitimate message that should not be flagged
 */

export type Expected = 'HIGH RISK' | 'SUSPICIOUS+' | 'LOW RISK';
export type CorpusGroup = 'A' | 'B' | 'C' | 'D' | 'E';

export interface CorpusItem {
  id: string;
  group: CorpusGroup;
  expected: Expected;
  rationale: string;
  content: string;
}

export const GROUP_NAMES: Record<CorpusGroup, string> = {
  A: 'Obvious phishing',
  B: 'Sophisticated phishing',
  C: 'Legitimate university / education',
  D: 'Legitimate HR / security / SSO',
  E: 'Legitimate marketing / promotional',
};

export const FICTIONAL_EDU = ['brightwater-college.edu', 'hartwell-state.edu', 'hollis-state.edu'];

export const CORPUS: CorpusItem[] = [
  // ---------------------------------------------------------------- A. Obvious phishing
  {
    id: 'A1-password-reset',
    group: 'A',
    expected: 'HIGH RISK',
    rationale: 'Classic fake password-expiry notice: urgency, threat of suspension, reset link on an unrelated domain.',
    content: `From: Northwind Mail Support <support@northwind-mail.example>
Subject: Your password expires today

Hello user,

Your Northwind Mail password expires today. To keep your account active you must reset your password immediately.

Reset now: http://northwind-mail-reset.example/login/reset

Failure to act within 24 hours will result in your account being suspended.

Northwind Mail Support Team`,
  },
  {
    id: 'A2-bank-security-alert',
    group: 'A',
    expected: 'HIGH RISK',
    rationale: 'Fake bank alert: unusual sign-in, account locked, verify identity within 24 hours on a look-alike domain.',
    content: `From: FirstHarbor Bank Security <alerts@firstharbor-secure.example>
Subject: Security alert: your account has been temporarily locked

Dear customer,

We noticed an unusual sign-in to your FirstHarbor Bank account from a new device. For your protection your account has been temporarily locked.

Verify your identity within 24 hours to restore access: https://firstharbor-secure.example/verify

If you do not verify, your account will be permanently closed.

FirstHarbor Bank Security Department`,
  },
  {
    id: 'A3-fake-invoice',
    group: 'A',
    expected: 'HIGH RISK',
    rationale: 'Overdue-invoice pressure with legal threat and a pay-now link to a payment page on an unknown domain.',
    content: `From: Accounts Receivable <billing@acme-billing-portal.example>
Subject: OVERDUE: Invoice #88421, payment required

Dear customer,

Our records show invoice #88421 is overdue. Payment is required immediately to avoid legal action and late fees.

Pay now: http://acme-billing-portal.example/pay?id=88421

If you have already paid, please disregard this notice.

Accounts Receivable`,
  },
  {
    id: 'A4-mailbox-credential-harvest',
    group: 'A',
    expected: 'HIGH RISK',
    rationale: 'Mailbox-full lure that asks the recipient to confirm their email password on an external page.',
    content: `From: Mail Administrator <admin@mail-storage-verify.example>
Subject: Mailbox almost full (98%)

Your mailbox is almost full. To avoid losing incoming messages, confirm your email password and verify your account now:

https://mail-storage-verify.example/confirm

Enter your username and password on the page to continue. Messages may be deleted if no action is taken today.

Mail Administrator`,
  },
  {
    id: 'A5-parcel-fee-shortlink',
    group: 'A',
    expected: 'HIGH RISK',
    rationale: 'Parcel-fee scam: urgency, small payment demand, shortened link hiding the destination.',
    content: `From: Courier Service <noreply@fastparcel-notice.example>
Subject: Final notice: parcel could not be delivered

Final notice: your parcel could not be delivered because of an unpaid customs fee of $1.99. Pay within 12 hours or the package will be returned to the sender.

Pay here: https://tinyurl.com/pk4x92m

Courier Service`,
  },

  // ---------------------------------------------------------------- B. Sophisticated phishing
  {
    id: 'B1-recruitment-identity-theft',
    group: 'B',
    expected: 'SUSPICIOUS+',
    rationale: 'Too-good job offer from a recruiter that moves straight to identity verification with ID upload. No password is requested.',
    content: `From: Elena Park, Meridian Talent Partners <elena.park@meridian-talent-onboard.example>
Subject: Senior Data Analyst opportunity (fully remote, $145,000)

Hi Jordan,

I came across your profile and think you would be an excellent fit for a fully remote Senior Data Analyst role with one of our clients. Compensation is $145,000 plus bonus, with a start date next month, and no formal interview process for strong candidates.

The first step is a short onboarding and identity verification so we can prepare your offer paperwork:

https://meridian-talent-onboard.example/start

You will be asked to confirm your full legal name, date of birth and home address, and to upload a photo ID. Positions like this fill fast, so please complete this by Thursday.

Best,
Elena Park
Senior Recruiter`,
  },
  {
    id: 'B2-alumni-scholarship-lookalike',
    group: 'B',
    expected: 'SUSPICIOUS+',
    rationale: 'Fake alumni scholarship with a scarcity deadline and single-sign-on request. The link is a look-alike (not .edu) that contains the institution name.',
    content: `From: Westbrook University Online Programs <programs@westbrook-university-programs.example>
Subject: Your seat in the Data Leadership Certificate is reserved

Dear Alumni Member,

As a valued member of the Westbrook University alumni network you have been pre-selected for a 50% scholarship toward our online Data Leadership Certificate. Only 40 seats remain and the scholarship window closes Friday.

Reserve your seat: https://westbrook-university-programs.example/claim

Sign in with your university single sign-on to confirm your alumni status and claim the scholarship.

Westbrook University Office of Continuing Education`,
  },
  {
    id: 'B3-ceo-payment-request',
    group: 'B',
    expected: 'SUSPICIOUS+',
    rationale: 'Business email compromise: executive urgency, changed vendor bank details, large payment, secrecy. No link or credential request at all.',
    content: `From: Marcus Reed <marcus.reed@harbourtech-group.example>
Subject: Quick favor

Hi Dana,

I am tied up in meetings all afternoon and cannot take calls. I need you to handle something quickly and discreetly.

Our vendor Harlow Supply has changed their bank details. Please update them and send the outstanding payment of $18,400 today. Send me a confirmation as soon as it is done.

Let's keep this between us until the payment clears.

Thanks,
Marcus`,
  },
  {
    id: 'B4-document-share-login',
    group: 'B',
    expected: 'SUSPICIOUS+',
    rationale: 'Fake document-sharing notification: enticing file name, expiry pressure, requires work email and password on an unrelated site.',
    content: `From: Brightline Document Sharing <share@docs-sharepoint-view.example>
Subject: Alex Moreno shared "Q3 Compensation Review" with you

Alex Moreno has shared a document with you.

Q3 Compensation Review.xlsx

Open document: https://docs-sharepoint-view.example/s/8f3kQ2

You will need to sign in with your work email and password to view this file. This link will expire in 48 hours.

Brightline Document Sharing`,
  },
  {
    id: 'B5-benefits-credential-request',
    group: 'B',
    expected: 'SUSPICIOUS+',
    rationale: 'HR-themed lure: benefits deadline with loss of coverage, asks for company credentials on an external portal.',
    content: `From: Human Resources Benefits <benefits@benefits-enroll-update.example>
Subject: Action needed: confirm your 2027 benefits elections

Hello,

Open enrollment for 2027 benefits closes this Friday. Elections that are not confirmed will default to no coverage.

To confirm your selections, log in to the employee benefits portal with your company credentials:

https://benefits-enroll-update.example/employee

Please complete this today.

Human Resources Benefits Team`,
  },

  // ---------------------------------------------------------------- C. Legitimate university / education
  {
    id: 'C1-admissions-deadline',
    group: 'C',
    expected: 'LOW RISK',
    rationale: 'Genuine admissions reminder: deadline and application wording, link to the institution own .edu domain, phone contact.',
    content: `From: Office of Admissions, Brightwater College <admissions@brightwater-college.edu>
Subject: Reminder: Regular Decision deadline is January 15

Dear applicant,

This is a friendly reminder that the Regular Decision application deadline for Brightwater College is January 15. You can check which materials we have received at any time in your applicant portal at https://admissions.brightwater-college.edu/portal.

If you have questions about transcripts or recommendations, call the admissions office at 555-0142 or reply to this email. We look forward to reading your application.

Office of Admissions
Brightwater College`,
  },
  {
    id: 'C2-scholarship-award',
    group: 'C',
    expected: 'LOW RISK',
    rationale: 'Genuine scholarship award notice. Deliberately shares vocabulary with scams (selected, tuition, SSO, exclusive, deadline) but links to the university own domain.',
    content: `From: Financial Aid Office, Hartwell State University <finaid@hartwell-state.edu>
Subject: Your Hartwell Merit Scholarship

Dear Maya,

Congratulations! You have been selected to receive the Hartwell Merit Scholarship, covering 50% of your tuition for the 2027 academic year.

To accept the award, please sign in to the Student Financial Aid portal at https://finaid.hartwell-state.edu with your university SSO and accept by March 1. The award is exclusive to incoming first-year students and cannot be transferred.

If you have questions, our office is open weekdays from 9 a.m. to 4 p.m.

Hartwell State University Financial Aid Office`,
  },
  {
    id: 'C3-course-registration',
    group: 'C',
    expected: 'LOW RISK',
    rationale: 'Genuine registrar notice: login and SSO wording, a registration deadline, link to the university domain.',
    content: `From: Registrar's Office, Hollis State University <registrar@hollis-state.edu>
Subject: Spring registration opens Monday

Hello students,

Spring registration opens Monday at 8 a.m. Log in to the student portal at https://registrar.hollis-state.edu using your university login (SSO). Check your registration time, clear any holds, and plan your schedule with your advisor.

Registration closes January 20. Changes after that date need an advisor's approval.

Registrar's Office
Hollis State University`,
  },
  {
    id: 'C4-campus-newsletter',
    group: 'C',
    expected: 'LOW RISK',
    rationale: 'Ordinary campus newsletter with event dates, a submission deadline and several links on the university domain.',
    content: `From: Hollis State Weekly <news@hollis-state.edu>
Subject: Hollis State Weekly, Issue 42

This week on campus:

- Fall career fair, October 14, Student Union. Bring copies of your resume.
- The library has extended hours during midterms, open until 1 a.m.
- Call for submissions: the Undergraduate Research Symposium, abstracts due October 30.

Read more: https://news.hollis-state.edu/weekly/42

You are receiving this because you subscribed to Hollis State Weekly. Unsubscribe at https://news.hollis-state.edu/unsubscribe`,
  },
  {
    id: 'C5-program-promotion',
    group: 'C',
    expected: 'LOW RISK',
    rationale: 'Genuine graduate program promotion with tuition discount, application deadline and limited seats, linking to the university own domain. Close in vocabulary to scam offers.',
    content: `From: Graduate School of Business, Hollis State University <gsb@hollis-state.edu>
Subject: Executive MBA information session, October 22

Join Hollis State's Graduate School of Business for an online information session on Thursday, October 22 at 6 p.m. Meet faculty, hear from alumni, and learn about admission requirements.

Alumni receive a 10% tuition discount and an application fee waiver for the January cohort. The application deadline is December 1. Seats for the session are limited, so please register by October 20:

https://gsb.hollis-state.edu/events/emba-info

We hope to see you there.

Graduate School of Business
Hollis State University`,
  },

  // ---------------------------------------------------------------- D. Legitimate HR / security / SSO
  {
    id: 'D1-sso-migration-notice',
    group: 'D',
    expected: 'LOW RISK',
    rationale: 'Genuine IT notice about moving to SSO. It tells people never to share their password, so the word "password" appears in a protective sense. No link, no action required.',
    content: `From: IT Service Desk <helpdesk@corp-acme.example>
Subject: We are moving to single sign-on (SSO) on October 14

Hi all,

On October 14 we are moving our internal tools to single sign-on (SSO). You will keep using your normal work email to log in; the sign-in page will simply look a little different. No action is required.

As always, never share your password with anyone. IT will never ask for your password or authentication codes by email or chat. If something looks wrong, contact the Service Desk on extension 4400.

Thanks,
IT Service Desk`,
  },
  {
    id: 'D2-mfa-enrollment',
    group: 'D',
    expected: 'LOW RISK',
    rationale: 'Genuine MFA rollout instructions: authenticator app, verification code, enrollment deadline, link to the intranet.',
    content: `From: Security Team <security@corp-acme.example>
Subject: Set up multi-factor authentication by October 31

To strengthen account security we are rolling out multi-factor authentication (MFA). Install the Acme Authenticator app on your phone and scan the QR code on your profile page at https://intranet.corp-acme.example/security/mfa.

From then on you will be asked for a verification code each time you sign in. Enrollment deadline: October 31.

Questions? Contact the Service Desk.

Security Team`,
  },
  {
    id: 'D3-open-enrollment',
    group: 'D',
    expected: 'LOW RISK',
    rationale: 'Genuine open-enrollment reminder: deadline and SSO sign-in to the company HR system. Contrast with B5, which asks for company credentials on an unrelated domain.',
    content: `From: HR Benefits Team <benefits@corp-acme.example>
Subject: Open enrollment runs through November 15

Hello team,

Open enrollment for 2027 benefits runs through November 15. Review your options and make your elections in Workday (sign in with SSO from the intranet home page): https://workday.corp-acme.example

Elections not made by the deadline carry over from this year. We are also hosting live Q&A sessions on November 3 and November 5 in the main conference room.

HR Benefits Team`,
  },
  {
    id: 'D4-annual-records-update',
    group: 'D',
    expected: 'LOW RISK',
    rationale: 'Genuine HR records update: employee verification, a Friday deadline, SSO, and an explicit warning that HR never asks for this by email reply.',
    content: `From: People Operations <people@corp-acme.example>
Subject: Annual records update, due Friday October 16

Hi,

As part of our annual records update, HR needs every employee to verify their employment details (home address and emergency contact) in the employee portal by Friday, October 16. Sign in with SSO at https://hr.corp-acme.example/records.

This is an internal task only. HR will never ask you to send these details by replying to an email.

Thank you,
People Operations`,
  },
  {
    id: 'D5-security-training-reminder',
    group: 'D',
    expected: 'LOW RISK',
    rationale: 'Genuine security-awareness training reminder with a deadline and SSO login to the company learning site.',
    content: `From: Security Team <security@corp-acme.example>
Subject: Reminder: annual security awareness training due October 31

Reminder: your annual security awareness training is due October 31. Log in through the SSO portal at https://learn.corp-acme.example, open "Security Awareness 2026" and complete the 25-minute course.

Topics include recognizing phishing, creating strong passwords, and reporting suspicious messages. Managers will receive a completion report on November 2.

Thanks,
Security Team`,
  },

  // ---------------------------------------------------------------- E. Legitimate marketing / promotional
  {
    id: 'E1-seasonal-sale',
    group: 'E',
    expected: 'LOW RISK',
    rationale: 'Ordinary retail sale email: big discount, sale end date, shop link.',
    content: `From: BrightCart <hello@brightcart.example>
Subject: Our biggest sale of the year starts now

Our biggest sale of the year starts now! Save up to 50% sitewide on coats, boots and accessories. Free shipping on orders over $75.

Sale ends Sunday at midnight, so don't miss out.

Shop now: https://shop.brightcart.example/sale

BrightCart, 200 Market Street, Springfield. You can unsubscribe at any time.`,
  },
  {
    id: 'E2-weekly-picks-tracking-link',
    group: 'E',
    expected: 'LOW RISK',
    rationale: 'Promotional newsletter using a shortened tracking link and a discount code. No credential or verification request.',
    content: `From: TrailHouse <news@trailhouse.example>
Subject: Your weekly picks are here

Your weekly picks are here. Fresh arrivals for fall: knit sweaters, trail shoes and cozy layers.

See what's new: https://bit.ly/3AbCdEf

Use code FALL15 for 15% off your next order. Terms apply.

TrailHouse, 14 Mill Road, Springfield. Manage your email preferences in your account settings.`,
  },
  {
    id: 'E3-saas-trial-ending',
    group: 'E',
    expected: 'LOW RISK',
    rationale: 'Typical SaaS trial-ending upsell with a discount and a deadline-style message.',
    content: `From: CloudNote Team <team@cloudnote.example>
Subject: Your free trial ends in 3 days

Your free CloudNote trial ends in 3 days. Upgrade to CloudNote Pro now and save 20% on your first year. After your trial ends your notebooks become read-only.

Upgrade: https://app.cloudnote.example/upgrade

Questions? Just reply to this email.

The CloudNote Team`,
  },
  {
    id: 'E4-webinar-invite',
    group: 'E',
    expected: 'LOW RISK',
    rationale: 'Webinar invitation using scarcity wording (limited seats, exclusive access) with a registration link.',
    content: `From: GreenLeaf Garden Co. <events@greenleaf-garden.example>
Subject: Join us live: Spring Planting 101

Join us live for "Spring Planting 101" with the GreenLeaf experts on Saturday at 10 a.m. Register today: seats are limited, and attendees get exclusive access to the recorded session.

Register: https://events.greenleaf-garden.example/spring101

We hope you can make it!

GreenLeaf Garden Co.`,
  },
  {
    id: 'E5-flash-sale-urgency',
    group: 'E',
    expected: 'LOW RISK',
    rationale: 'Aggressive but legitimate flash-sale marketing: last chance, hours left, offer expires tonight, act now. Urgency language only, no credentials.',
    content: `From: SwiftRun <deals@swiftrun.example>
Subject: FLASH SALE: last chance

FLASH SALE: last chance! Only 5 hours left to get 40% off all running gear. This offer expires tonight at 11:59 p.m. Act now before it's too late:

https://swiftrun.example/flash

Free returns on every order.

SwiftRun, 9 Lake Avenue, Springfield. Unsubscribe at any time.`,
  },
];
