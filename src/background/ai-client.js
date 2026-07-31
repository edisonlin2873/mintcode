let apiKey = '';
let apiBaseUrl = 'https://api.openai.com';
let model = 'gpt-4o';

function configure(key, baseUrl, m) {
  apiKey = key;
  if (baseUrl) apiBaseUrl = baseUrl;
  if (m) model = m;
}

async function callApi(messages) {
  const res = await fetch(`${apiBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

function buildSystemPrompt(problem, language) {
  return `You are a technical interviewer conducting a live coding interview. The candidate is solving a LeetCode problem.

Problem: ${problem.title}
Difficulty: ${problem.difficulty}
Language: ${language || 'unknown'}

Rules:
- Be encouraging but honest.
- Evaluate the candidate's spoken explanations and their code.
- If the candidate has been silent for over 45 seconds, gently prompt them with a question about their approach.
- Keep your responses concise (2-3 sentences max).
- Do NOT give away the solution.
- Ask clarifying questions about their approach when appropriate.`;
}

function buildEvaluationPrompt(problem, language, transcript, codeSnapshots, duration, submissions) {
  const codeHistory = codeSnapshots.map(s =>
    `[${s.timestamp}s into interview]:\n${s.code}`
  ).join('\n\n');

  const submissionLog = Array.isArray(submissions) && submissions.length
    ? submissions.map(s => `[${s.timeSeconds}s] ${s.status}`).join('\n')
    : '(no submissions)';

  return `Evaluate this technical interview performance.

Problem: ${problem.title} (${problem.difficulty})
Language: ${language || 'unknown'}
Duration used: ${duration} seconds

TRANSCRIPT of candidate's spoken explanations:
${transcript || '(no speech detected)'}

CODE HISTORY (chronological snapshots):
${codeHistory || '(no code written)'}

SUBMISSION HISTORY (verdicts from LeetCode):
${submissionLog}

Rate each dimension 1-10:
1. Problem Understanding - Did they grasp the problem? Ask clarifying questions?
2. Communication - Did they explain their thought process clearly?
3. Algorithmic Thinking - Is the approach optimal? Edge cases considered? Complexity analysis?
4. Code Quality & Correctness - Is the code clean, readable, syntactically correct? Did submissions pass?
5. Speed & Time Management - Did they make steady progress? How many attempts before a passing submission?

Provide your response in this format:
{
  "scores": {
    "problemUnderstanding": { "score": N, "reason": "..." },
    "communication": { "score": N, "reason": "..." },
    "algorithmicThinking": { "score": N, "reason": "..." },
    "codeQuality": { "score": N, "reason": "..." },
    "speed": { "score": N, "reason": "..." }
  },
  "overallScore": N,
  "summary": "...",
  "recommendation": "Hire | Leaning Hire | Leaning No | No"
}`;
}

export { configure, callApi, buildSystemPrompt, buildEvaluationPrompt };
