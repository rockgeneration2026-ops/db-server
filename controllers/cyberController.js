import crypto from "crypto";
import { promises as dns } from "dns";

const safeResolve = async (resolver, fallback = []) => {
  try {
    return await resolver();
  } catch {
    return fallback;
  }
};

const isIpv4 = (ip = "") => /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(ip);
const isIpv6 = (ip = "") => ip.includes(":");

const getIpv4Class = (ip = "") => {
  if (!isIpv4(ip)) return "Unknown";
  const firstOctet = Number(ip.split(".")[0]);
  if (firstOctet <= 126) return "Class A";
  if (firstOctet <= 191) return "Class B";
  if (firstOctet <= 223) return "Class C";
  if (firstOctet <= 239) return "Class D";
  return "Class E";
};

const getPrivateState = (ip = "") => {
  if (ip === "127.0.0.1" || ip === "::1") return "Loopback";
  if (isIpv4(ip) && /^10\./.test(ip)) return "Private";
  if (isIpv4(ip) && /^192\.168\./.test(ip)) return "Private";
  if (isIpv4(ip) && /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return "Private";
  if (isIpv6(ip) && ip.toLowerCase().startsWith("fc")) return "Private";
  if (isIpv6(ip) && ip.toLowerCase().startsWith("fd")) return "Private";
  return "Public or Unknown";
};

export const passwordStrength = async (req, res) => {
  const password = req.body.password || "";
  let score = 0;
  const checks = [
    { label: "At least 8 characters", passed: password.length >= 8 },
    { label: "Uppercase letter", passed: /[A-Z]/.test(password) },
    { label: "Lowercase letter", passed: /[a-z]/.test(password) },
    { label: "Number", passed: /[0-9]/.test(password) },
    { label: "Special character", passed: /[^A-Za-z0-9]/.test(password) }
  ];
  checks.forEach((check) => {
    if (check.passed) score += 1;
  });
  const labels = ["Very Weak", "Weak", "Moderate", "Strong", "Very Strong"];
  const suggestions = checks.filter((check) => !check.passed).map((check) => `Add ${check.label.toLowerCase()}.`);
  const crackTime =
    score <= 1 ? "Seconds" :
    score === 2 ? "Minutes to hours" :
    score === 3 ? "Days to weeks" :
    score === 4 ? "Months to years" :
    "Years+";

  res.json({
    score,
    maxScore: checks.length,
    percentage: Math.round((score / checks.length) * 100),
    label: labels[Math.max(score - 1, 0)] || "Very Weak",
    checks,
    passwordLength: password.length,
    estimatedCrackTime: crackTime,
    suggestions
  });
};

export const hashGenerator = async (req, res) => {
  const value = req.body.value || "";
  const hashes = [
    { algorithm: "MD5", digest: crypto.createHash("md5").update(value).digest("hex") },
    { algorithm: "SHA1", digest: crypto.createHash("sha1").update(value).digest("hex") },
    { algorithm: "SHA256", digest: crypto.createHash("sha256").update(value).digest("hex") },
    { algorithm: "SHA512", digest: crypto.createHash("sha512").update(value).digest("hex") }
  ];

  res.json({
    inputLength: value.length,
    hashes
  });
};

export const dnsLookup = async (req, res, next) => {
  try {
    const host = (req.body.host || "").trim();
    const records = {
      lookup: await safeResolve(() => dns.lookup(host, { all: true }), []),
      a: await safeResolve(() => dns.resolve4(host), []),
      aaaa: await safeResolve(() => dns.resolve6(host), []),
      cname: await safeResolve(() => dns.resolveCname(host), []),
      mx: await safeResolve(() => dns.resolveMx(host), []),
      ns: await safeResolve(() => dns.resolveNs(host), []),
      txt: await safeResolve(() => dns.resolveTxt(host), []),
      soa: await safeResolve(() => dns.resolveSoa(host), null)
    };

    res.json({
      host,
      summary: {
        lookupCount: records.lookup.length,
        aCount: records.a.length,
        aaaaCount: records.aaaa.length,
        mxCount: records.mx.length,
        nsCount: records.ns.length,
        txtCount: records.txt.length
      },
      records
    });
  } catch (error) {
    next(error);
  }
};

export const ipLookup = async (req, res) => {
  const ip = req.body.ip || req.ip;
  res.json({
    ip,
    version: isIpv4(ip) ? "IPv4" : isIpv6(ip) ? "IPv6" : "Unknown",
    scope: getPrivateState(ip),
    networkClass: getIpv4Class(ip),
    reversePointer: isIpv4(ip) ? ip.split(".").reverse().join(".") + ".in-addr.arpa" : "n/a",
    binaryPreview: isIpv4(ip)
      ? ip
          .split(".")
          .map((part) => Number(part).toString(2).padStart(8, "0"))
          .join(".")
      : "n/a",
    warning: "This starter lookup does not use an external geolocation API. Wire a trusted provider for ASN and country data in production."
  });
};

export const whoisLookup = async (req, res) => {
  const domain = (req.body.domain || "").trim().toLowerCase();
  const labels = domain ? domain.split(".") : [];
  const nsRecords = domain ? await safeResolve(() => dns.resolveNs(domain), []) : [];
  const lookupRecords = domain ? await safeResolve(() => dns.lookup(domain, { all: true }), []) : [];

  res.json({
    domain,
    ipAddresses: lookupRecords.map((record) => record.address),
    registrarStatus: domain ? "Lookup simulated" : "No domain provided",
    tld: labels.length ? labels[labels.length - 1] : "n/a",
    labelCount: labels.length,
    estimatedDomainLength: domain.length,
    nameservers: nsRecords,
    lookedUpAt: new Date().toISOString(),
    warning: "WHOIS data here is a safe starter response. Use a dedicated provider or system WHOIS service for real registrant details."
  });
};
