import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const questions = [
  // ── Fun (10) ──
  {
    text: "If you could have dinner with anyone, alive or dead, who would it be?",
    options: ["A historical figure", "A celebrity crush", "A fictional character", "My future self"],
    category: "fun",
  },
  {
    text: "What's your go-to karaoke song?",
    options: ["A power ballad", "A rap banger", "A cheesy pop hit", "I'd rather watch"],
    category: "fun",
  },
  {
    text: "You win the lottery tomorrow. First thing you do?",
    options: ["Book a one-way flight", "Quit my job dramatically", "Buy a house for my parents", "Invest it all and pretend nothing happened"],
    category: "fun",
  },
  {
    text: "What's your hidden talent?",
    options: ["I can cook anything from scratch", "I do impressions of celebrities", "I'm secretly a great dancer", "I can fix literally anything"],
    category: "fun",
  },
  {
    text: "Pick your dream vacation vibe:",
    options: ["Beach resort, zero plans", "Backpacking through cities", "Mountain cabin with books", "Food tour across a country"],
    category: "fun",
  },
  {
    text: "What's the most spontaneous thing you've ever done?",
    options: ["Booked a last-minute trip", "Said yes to a dare", "Showed up to a stranger's party", "Changed my entire career path"],
    category: "fun",
  },
  {
    text: "If your life had a theme song, what genre would it be?",
    options: ["Upbeat pop anthem", "Chill lo-fi beats", "Epic movie soundtrack", "Classic rock ballad"],
    category: "fun",
  },
  {
    text: "You can only eat one cuisine for the rest of your life:",
    options: ["Italian", "Japanese", "Mexican", "Indian"],
    category: "fun",
  },
  {
    text: "What superpower would you actually want?",
    options: ["Teleportation", "Reading minds", "Time travel", "Speaking every language"],
    category: "fun",
  },
  {
    text: "Your ideal Sunday looks like:",
    options: ["Brunch with friends", "Solo adventure outdoors", "Netflix marathon in pajamas", "Farmers market + cooking"],
    category: "fun",
  },

  // ── Values (10) ──
  {
    text: "What matters most to you in a relationship?",
    options: ["Trust and honesty", "Sense of humor", "Shared ambitions", "Emotional support"],
    category: "values",
  },
  {
    text: "How do you handle disagreements?",
    options: ["Talk it out immediately", "Take space then discuss", "Write down my thoughts first", "Try to find a compromise quickly"],
    category: "values",
  },
  {
    text: "What's your love language?",
    options: ["Words of affirmation", "Quality time", "Acts of service", "Physical touch"],
    category: "values",
  },
  {
    text: "Where do you see yourself in 5 years?",
    options: ["Traveling the world", "Building a career", "Starting a family", "Figuring it out — and that's okay"],
    category: "values",
  },
  {
    text: "What role does family play in your life?",
    options: ["They're my everything", "Close but independent", "Chosen family matters most", "Still figuring that out"],
    category: "values",
  },
  {
    text: "How important is ambition in a partner?",
    options: ["Very — I need a go-getter", "Somewhat — passion matters more", "Not much — happiness is key", "Balance is everything"],
    category: "values",
  },
  {
    text: "What's a dealbreaker for you?",
    options: ["Dishonesty", "Lack of communication", "No sense of humor", "Different life goals"],
    category: "values",
  },
  {
    text: "How do you show someone you care?",
    options: ["I remember the small things", "I plan thoughtful dates", "I'm always there to listen", "I make them laugh every day"],
    category: "values",
  },
  {
    text: "What's your approach to personal growth?",
    options: ["Therapy and self-reflection", "Learning new skills constantly", "Surrounding myself with great people", "Stepping outside my comfort zone"],
    category: "values",
  },
  {
    text: "How do you recharge after a tough week?",
    options: ["Alone time is sacred", "Being around people I love", "Exercise or being outdoors", "Creative outlets (music, art, writing)"],
    category: "values",
  },

  // ── Lighthearted (10) ──
  {
    text: "Pineapple on pizza?",
    options: ["Absolutely yes!", "Hard no", "Only Hawaiian style", "I'll try anything once"],
    category: "lighthearted",
  },
  {
    text: "Are you a morning person or night owl?",
    options: ["Early bird catches the worm", "Night owl — my brain wakes up at 10pm", "Depends on the day", "I'm a permanent mid-afternoon person"],
    category: "lighthearted",
  },
  {
    text: "Dogs or cats?",
    options: ["Dogs — loyal and goofy", "Cats — independent and chill", "Both!", "Neither — I want a parrot"],
    category: "lighthearted",
  },
  {
    text: "What's your texting style?",
    options: ["Instant replier", "Thoughtful but slow", "Voice notes all day", "Memes speak louder than words"],
    category: "lighthearted",
  },
  {
    text: "Biggest green flag in someone?",
    options: ["They're kind to strangers", "They make me laugh effortlessly", "They remember what I said weeks ago", "They have their own passions"],
    category: "lighthearted",
  },
  {
    text: "Movie night — who picks?",
    options: ["I have strong opinions", "You pick, I'm easy", "We take turns", "We spend 45 min deciding together"],
    category: "lighthearted",
  },
  {
    text: "Your phone battery is at 5%. You use it to:",
    options: ["Send one last text", "Take a photo", "Order food", "Just let it die — freedom!"],
    category: "lighthearted",
  },
  {
    text: "What's your guilty pleasure show?",
    options: ["Reality TV dating shows", "True crime documentaries", "90s/2000s sitcom reruns", "I have no guilt about my taste"],
    category: "lighthearted",
  },
  {
    text: "How do you feel about surprises?",
    options: ["Love them — the bigger the better", "Small surprises only", "I prefer to plan everything", "Surprise me and find out"],
    category: "lighthearted",
  },
  {
    text: "First date energy?",
    options: ["Coffee — low-key and casual", "Dinner — let's go all in", "An activity like bowling or hiking", "A walk and deep conversation"],
    category: "lighthearted",
  },
]

async function main() {
  console.log('Seeding 30 icebreaker questions...')

  for (const q of questions) {
    await prisma.icebreakerQuestion.create({
      data: {
        text: q.text,
        options: q.options,
        category: q.category,
        isActive: true,
      },
    })
  }

  const count = await prisma.icebreakerQuestion.count()
  console.log(`Done! ${count} icebreaker questions in database.`)
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
