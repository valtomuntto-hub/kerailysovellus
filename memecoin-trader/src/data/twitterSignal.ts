import { config } from "../config.js";
import { logger } from "../logger.js";

const API_BASE = "https://api.x.com/2";

/**
 * X (Twitter) -signaali: seuraa kayttajan itse antamia tileja (esim.
 * vaikutusvaltaisia henkiloita) ja poimii niiden tuoreista twiiteista
 * kryptoon/tiettyyn tokeniin viittaavat maininnat.
 *
 * Tama on tietoisesti YKSINKERTAINEN avainsana-/cashtag-haku, ei mitaan
 * "AI lukee sentimentin" -tason analyysia - lapinakyvaa ja rehellista
 * siita mita se oikeasti tekee. Vaatii oman X-kehittajatilin ja maksaa
 * kayton mukaan (developer.x.com) - katso README ennen kayttoonottoa.
 */

export interface RelevantTweet {
  handle: string;
  tweetId: string;
  text: string;
  createdAt: number; // ms epoch
  /** Poimitut $CASHTAGIT (isoilla, ilman $-merkkia). Tyhja jos vain geneerinen kryptomaininta. */
  mentionedSymbols: string[];
  /** True jos twiitissa oli yleinen kryptoon viittaava sana mutta ei yhtaan tunnistettua cashtagia. */
  genericCryptoMention: boolean;
}

export function parseWatchedHandles(): string[] {
  return config.TWITTER_WATCHED_HANDLES.split(",")
    .map((h) => h.trim().replace(/^@/, ""))
    .filter(Boolean);
}

export function isEnabled(): boolean {
  return Boolean(config.TWITTER_BEARER_TOKEN) && parseWatchedHandles().length > 0;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${config.TWITTER_BEARER_TOKEN}` } });
    if (!res.ok) {
      logger.warn(`X API vastasi ${res.status}: ${url}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    logger.warn("X API -haku epaonnistui", url, err);
    return null;
  }
}

const userIdCache = new Map<string, string>();

async function resolveUserId(handle: string): Promise<string | null> {
  const cached = userIdCache.get(handle);
  if (cached) return cached;
  const data = await fetchJson(`${API_BASE}/users/by/username/${encodeURIComponent(handle)}`);
  const id = data?.data?.id as string | undefined;
  if (id) userIdCache.set(handle, id);
  return id ?? null;
}

const CRYPTO_KEYWORDS = ["crypto", "bitcoin", "btc", "solana", "$sol", "memecoin", "coin", "token", "web3"];

/** Poimii tekstista $CASHTAGIT ja yleiset kryptoavainsanat. Ei tayellinen NLP - yksinkertainen tekstihaku. */
export function extractSignals(text: string): { symbols: string[]; genericCryptoMention: boolean } {
  const symbols = new Set<string>();
  const cashtags = text.match(/\$[A-Za-z]{2,15}\b/g) ?? [];
  for (const tag of cashtags) symbols.add(tag.slice(1).toUpperCase());

  const lower = text.toLowerCase();
  const genericCryptoMention = CRYPTO_KEYWORDS.some((kw) => lower.includes(kw));

  return { symbols: Array.from(symbols), genericCryptoMention };
}

export interface TweetPollResult {
  relevant: RelevantTweet[];
  /** handle -> uusin nahty tweet-id (VAIKKA se ei olisi relevantti) - tallenna
   *  tama aina "viimeksi nahdyksi", jotta epaolennaisia twiitteja ei osteta
   *  ja lueta uudelleen joka kierroksella. */
  latestSeenIds: Map<string, string>;
}

/**
 * Hakee uudet twiitit jokaiselta seuratulta tililta `sinceIds`:n jalkeen
 * (kartta handle -> viimeksi nahty tweet-id). Kayttaja maksaa jokaisesta
 * X API-kutsusta, joten tata kutsutaan harvemmin kuin paaskannaus (katso
 * TWITTER_POLL_INTERVAL_SECONDS).
 */
export async function fetchNewRelevantTweets(sinceIds: Map<string, string>): Promise<TweetPollResult> {
  const handles = parseWatchedHandles();
  const relevant: RelevantTweet[] = [];
  const latestSeenIds = new Map<string, string>();

  for (const handle of handles) {
    const userId = await resolveUserId(handle);
    if (!userId) continue;

    const url = new URL(`${API_BASE}/users/${userId}/tweets`);
    url.searchParams.set("max_results", "5");
    url.searchParams.set("tweet.fields", "created_at");
    url.searchParams.set("exclude", "retweets,replies");
    const sinceId = sinceIds.get(handle);
    if (sinceId) url.searchParams.set("since_id", sinceId);

    const data = await fetchJson(url.toString());
    const tweets: any[] = data?.data ?? [];
    if (tweets.length === 0) continue;

    // X palauttaa uusimmat ensin - talteen otetaan aina tuorein id (relevanssista riippumatta).
    latestSeenIds.set(handle, tweets[0].id);

    // Kaannetaan niin etta vanhin kasitellaan ensin (aikajarjestys opetusta/lokia varten).
    for (const t of [...tweets].reverse()) {
      const text: string = t.text ?? "";
      const { symbols, genericCryptoMention } = extractSignals(text);
      if (symbols.length === 0 && !genericCryptoMention) continue;
      relevant.push({
        handle,
        tweetId: t.id,
        text,
        createdAt: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
        mentionedSymbols: symbols,
        genericCryptoMention,
      });
    }
  }

  return { relevant, latestSeenIds };
}
