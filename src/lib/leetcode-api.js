const ZEROTRAC_DATA_URL = 'https://zerotrac.github.io/leetcode_problem_rating/data.json';
const LEETCODE_GRAPHQL = 'https://leetcode.com/graphql';

// Zerotrac contest ratings → approximate LeetCode difficulty bands
const RATING_BANDS = {
  easy: { min: 0, max: 1400 },
  medium: { min: 1400, max: 2000 },
  hard: { min: 2000, max: Infinity },
  random: { min: 0, max: Infinity },
};

let cachedProblems = null;

async function fetchZerotracProblems() {
  if (cachedProblems) return cachedProblems;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(ZEROTRAC_DATA_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`Zerotrac data returned ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Zerotrac data is empty');
    }
    cachedProblems = data;
    return cachedProblems;
  } finally {
    clearTimeout(timeout);
  }
}

function difficultyFromRating(rating) {
  if (rating < 1400) return 'Easy';
  if (rating < 2000) return 'Medium';
  return 'Hard';
}

function toProblem(entry) {
  const difficulty = difficultyFromRating(entry.Rating);
  return {
    id: entry.ID,
    title: entry.Title,
    titleSlug: entry.TitleSlug,
    difficulty,
    rating: entry.Rating,
    url: `https://leetcode.com/problems/${entry.TitleSlug}/`,
  };
}

function filterByDifficulty(problems, difficulty) {
  const band = RATING_BANDS[difficulty] || RATING_BANDS.random;
  return problems.filter((p) => p.Rating >= band.min && p.Rating < band.max);
}

async function getRandomProblem(difficulty = 'medium') {
  const all = await fetchZerotracProblems();
  let pool = filterByDifficulty(all, difficulty);
  if (pool.length === 0) pool = all;

  const entry = pool[Math.floor(Math.random() * pool.length)];
  return toProblem(entry);
}

const PROBLEM_DETAIL_QUERY = `
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    title
    titleSlug
    difficulty
    content
    topicTags {
      name
      slug
    }
  }
}
`;

async function getProblemDetail(titleSlug) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(LEETCODE_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Referer: 'https://leetcode.com/problemset/',
      },
      body: JSON.stringify({
        query: PROBLEM_DETAIL_QUERY,
        variables: { titleSlug },
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`LeetCode API returned ${res.status}`);

    const json = await res.json();
    if (json.errors) {
      throw new Error(json.errors[0].message || 'GraphQL error');
    }

    return json.data?.question || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export { getRandomProblem, getProblemDetail, fetchZerotracProblems, ZEROTRAC_DATA_URL };
