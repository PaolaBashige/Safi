export interface Lesson {
  id: string;
  title: string;
  what: string;
  lookFor: string[];
  doThis: string[];
}

export const LESSONS: Lesson[] = [
  {
    id: 'phishing',
    title: 'Phishing',
    what: 'Phishing is a message that pretends to be from a company, coworker or friend to trick you into clicking a link, sharing information or sending money.',
    lookFor: [
      'A sender address that is slightly off from the real one',
      'A generic greeting like "Dear customer"',
      'A request to sign in, verify or confirm something',
      'A link whose real destination does not match the message',
    ],
    doThis: [
      'Do not click. Open the official website or app yourself.',
      'Check with the sender using another channel, like a phone call.',
      'Report the message and delete it.',
    ],
  },
  {
    id: 'social-engineering',
    title: 'Social engineering',
    what: 'Social engineering manipulates people, not computers. Attackers use trust, helpfulness or fear to get you to hand over access or information.',
    lookFor: [
      'Someone you do not know acting as if they know you',
      'Pretending to be IT support, a bank, a boss or an official',
      'Requests that skip normal steps "just this once"',
      'Pressure not to tell or check with anyone',
    ],
    doThis: [
      'Slow down. Real requests can survive a quick check.',
      'Verify the person using contact details you already trust.',
      'Follow your normal process even when someone says it is urgent.',
    ],
  },
  {
    id: 'suspicious-links',
    title: 'Suspicious links',
    what: 'A link can look like it goes one place but lead somewhere else. Scammers hide or imitate real addresses to catch people who click quickly.',
    lookFor: [
      'Shortened links (like bit.ly) that hide the destination',
      'Look-alike names such as paypa1 or micros0ft',
      'Long chains of words and dots before the real domain',
      'Links that begin with an IP address or contain an "@"',
    ],
    doThis: [
      'On a computer, hover over a link to preview it. On a phone, press and hold.',
      'Type the address yourself or use a bookmark instead.',
      'If you cannot tell where it goes, do not open it.',
    ],
  },
  {
    id: 'credential-protection',
    title: 'Credential protection',
    what: 'Your passwords and one-time codes are the keys to your accounts. Protecting them stops most account takeovers.',
    lookFor: [
      'Any message asking for your password, PIN or a code sent to you',
      'Sign-in pages you reached through a message or ad',
      'Reusing the same password across accounts',
    ],
    doThis: [
      'Never share a password or code, even with someone who says they work for the company.',
      'Use a password manager and a unique password for each account.',
      'Turn on multi-factor authentication, ideally with an app or security key.',
    ],
  },
  {
    id: 'urgency',
    title: 'Urgency and manipulation',
    what: 'Scammers create time pressure and strong emotions so you act before you think. Fear, excitement and guilt all work well on them.',
    lookFor: [
      'Deadlines such as "within 24 hours" or "act now"',
      'Threats: closed accounts, fines, legal trouble',
      'Surprise rewards or prizes',
      'Appeals to help someone in trouble right now',
    ],
    doThis: [
      'Take a breath. Urgency is itself a warning sign.',
      'Wait before acting, even just ten minutes.',
      'Ask someone you trust what they think.',
    ],
  },
  {
    id: 'after-clicking',
    title: 'If you clicked a suspicious link',
    what: 'It happens to careful people too. Acting quickly and calmly limits the damage.',
    lookFor: [
      'A page that asked for a password, card or code',
      'A file that downloaded or an app that tried to install',
      'Unexpected sign-in alerts or password reset emails afterwards',
    ],
    doThis: [
      'Do not enter anything more. Close the page.',
      'If you typed a password, change it right away on the real site, and anywhere you reused it.',
      'Run a security scan if you downloaded anything, and tell your IT contact or the affected company.',
      'Watch your accounts for strange activity and consider a credit freeze if you shared financial details.',
    ],
  },
];

export interface Choice {
  text: string;
  safer: boolean;
  feedback: string;
}

export interface Scenario {
  id: string;
  title: string;
  setup: string;
  message: string;
  choices: Choice[];
  lesson: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'login',
    title: 'The suspicious login message',
    setup: 'You get this text while you are at lunch:',
    message:
      'SecureBank Alert: We detected an unusual sign-in to your account. Confirm your identity within 30 minutes or your account will be locked: http://securebank-verify.example/login',
    choices: [
      {
        text: 'Tap the link and confirm quickly so the account does not get locked.',
        safer: false,
        feedback: 'Risky. The deadline and the threat are designed to make you click before you think. The link could lead to a fake sign-in page.',
      },
      {
        text: 'Ignore the link, open the bank\'s official app myself and check for alerts.',
        safer: true,
        feedback: 'Safer. Going to the app or website yourself means you are on the real thing, whatever the message said.',
      },
      {
        text: 'Reply STOP to the text.',
        safer: false,
        feedback: 'Riskier than it looks. Replying tells the sender your number is active and may lead to more scams.',
      },
      {
        text: 'Call the number printed on the back of my bank card.',
        safer: true,
        feedback: 'Safer. A phone number you already trust is a good way to confirm whether anything is really wrong.',
      },
    ],
    lesson: 'Real banks do not ask you to confirm your identity through a link in a text. Verify through the official app or a number you already trust.',
  },
  {
    id: 'payment',
    title: 'The urgent payment request',
    setup: 'An email arrives that looks like it is from your manager:',
    message:
      'Hi, I\'m in a meeting and can\'t talk. I need you to buy five gift cards for a client today. Send me the codes here. I\'ll reimburse you. Keep this between us for now.',
    choices: [
      {
        text: 'Buy the gift cards and send the codes. It is my manager, after all.',
        safer: false,
        feedback: 'Risky. Gift card codes are nearly impossible to recover, and the request for secrecy and speed are classic signs of impersonation.',
      },
      {
        text: 'Check the sender\'s email address, then call or message my manager on a known number.',
        safer: true,
        feedback: 'Safer. A quick check through a different channel quickly shows whether the request is real.',
      },
      {
        text: 'Reply asking for more details about the client.',
        safer: false,
        feedback: 'Riskier. Replying keeps you in the scammer\'s conversation, and they will have convincing answers ready.',
      },
      {
        text: 'Report it to IT or security and do not act on it.',
        safer: true,
        feedback: 'Safer. Reporting helps protect your coworkers, who may receive the same message.',
      },
    ],
    lesson: 'Requests for gift cards, secrecy and speed together are a strong warning sign. Always confirm payment requests through a second channel.',
  },
  {
    id: 'shortened',
    title: 'The shortened link',
    setup: 'A friend\'s social media account sends you this direct message:',
    message: 'omg is this you in this video?? 😳 http://bit.ly/3xYzQ9',
    choices: [
      {
        text: 'Click it. A friend sent it, so it should be fine.',
        safer: false,
        feedback: 'Risky. Hacked accounts send messages like this to everyone they know. A shortened link hides where it leads.',
      },
      {
        text: 'Message my friend in another app or in person to ask if they sent it.',
        safer: true,
        feedback: 'Safer. If their account was hacked, they will want to know, and you will find out without clicking anything.',
      },
      {
        text: 'Forward it to other friends to warn them about it.',
        safer: false,
        feedback: 'Risky. Forwarding the link can spread it. Warn people in words instead, without the link.',
      },
      {
        text: 'Do not click. Paste the link into Safi to check it first.',
        safer: true,
        feedback: 'Safer. Checking a link without opening it is a great habit. Remember that a clean check does not prove a link is safe.',
      },
    ],
    lesson: 'Messages from friends can be sent by hackers. A shortened link with a vague, emotional hook is a reason to check before clicking.',
  },
  {
    id: 'code',
    title: 'The code request',
    setup: 'You just got a six-digit code by text, then this message arrives:',
    message: 'Hi, this is support. We sent a code to your phone by mistake. Please read it back to me so we can cancel it.',
    choices: [
      {
        text: 'Read the code back. They said it was a mistake on their end.',
        safer: false,
        feedback: 'Risky. That code is probably for a sign-in the attacker is attempting right now. Sharing it lets them into your account.',
      },
      {
        text: 'Do not share it. Check whether someone is trying to sign in to my account.',
        safer: true,
        feedback: 'Safer. An unrequested code means someone may have your password. Change it and check your security settings.',
      },
      {
        text: 'Share only the first three digits to be careful.',
        safer: false,
        feedback: 'Riskier. Partial codes still help an attacker, and they can ask for the rest.',
      },
    ],
    lesson: 'No real company will ask you to read back a verification code. Treat these codes like passwords.',
  },
];

export interface ExampleInput {
  label: string;
  type: 'message' | 'url';
  content: string;
}

export const EXAMPLES: ExampleInput[] = [
  {
    label: 'Account suspended message',
    type: 'message',
    content: 'URGENT: Your bank account has been suspended. Verify your account immediately: https://example.com/verify',
  },
  {
    label: 'Missed delivery message',
    type: 'message',
    content: 'Your package could not be delivered. Click here to reschedule: http://bit.ly/3xYz',
  },
  {
    label: 'Ordinary team message',
    type: 'message',
    content: 'Hi team, lunch is at noon tomorrow in the break room. Let me know if you have any dietary needs.',
  },
  {
    label: 'Look-alike login link',
    type: 'url',
    content: 'http://paypa1-secure-login.example/verify/account',
  },
  {
    label: 'Shortened link',
    type: 'url',
    content: 'https://bit.ly/3xYz',
  },
  {
    label: 'Ordinary website',
    type: 'url',
    content: 'https://www.python.org/downloads/',
  },
];
