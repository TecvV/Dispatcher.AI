import { env } from "../config/env.js";

function parseMeetingCodeFromLink(link) {
  const text = String(link || "");
  const m = text.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
  return m?.[1]?.toLowerCase() || "";
}

async function getJson(url, accessToken) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Meet API error ${res.status}: ${body}`);
  }
  return res.json();
}

function toMinutes(startTime, endTime) {
  const start = startTime ? new Date(startTime) : null;
  const end = endTime ? new Date(endTime) : new Date();
  if (!start || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = Math.max(0, end.getTime() - start.getTime());
  return diff / 60000;
}

function participantMatchesRole(participant, roleUser) {
  if (!participant || !roleUser) return false;
  const blob = JSON.stringify(participant).toLowerCase();
  const email = String(roleUser.email || "").trim().toLowerCase();
  const name = String(roleUser.name || "").trim().toLowerCase();
  if (email && blob.includes(email)) return true;
  if (name && blob.includes(name)) return true;
  return false;
}

export async function fetchMeetParticipantDwell({
  accessToken,
  meetLink,
  speakerUser,
  listenerUser
}) {
  if (!accessToken) {
    return {
      available: false,
      reason: "Missing Google access token for Meet attendance."
    };
  }
  const meetingCode = parseMeetingCodeFromLink(meetLink);
  if (!meetingCode) {
    return {
      available: false,
      reason: "Missing/invalid Google Meet link for attendance fetch."
    };
  }

  try {
    const recordsUrl = `${env.googleMeetApiBase}/conferenceRecords?filter=${encodeURIComponent(
      `space.meeting_code="${meetingCode}"`
    )}&pageSize=10`;
    const records = await getJson(recordsUrl, accessToken);
    const allRecords = Array.isArray(records.conferenceRecords) ? records.conferenceRecords : [];
    if (!allRecords.length) {
      return {
        available: false,
        reason: "No conference records found for this Meet."
      };
    }
    const record = allRecords
      .slice()
      .sort((a, b) => new Date(b.startTime || 0).getTime() - new Date(a.startTime || 0).getTime())[0];
    const recordName = String(record.name || "");
    if (!recordName) {
      return {
        available: false,
        reason: "Conference record missing name."
      };
    }

    const participants = await getJson(`${env.googleMeetApiBase}/${recordName}/participants?pageSize=200`, accessToken);
    const list = Array.isArray(participants.participants) ? participants.participants : [];
    if (!list.length) {
      return {
        available: true,
        listenerMinutes: 0,
        speakerMinutes: 0,
        speakerJoined: false,
        source: "google_meet_api_no_participants"
      };
    }

    let listenerMinutes = 0;
    let speakerMinutes = 0;

    for (const p of list) {
      const participantName = String(p.name || "");
      if (!participantName) continue;
      const sessionResp = await getJson(
        `${env.googleMeetApiBase}/${participantName}/participantSessions?pageSize=300`,
        accessToken
      );
      const sessions = Array.isArray(sessionResp.participantSessions) ? sessionResp.participantSessions : [];
      const minutes = sessions.reduce((acc, s) => acc + toMinutes(s.startTime, s.endTime), 0);

      if (participantMatchesRole(p, listenerUser)) listenerMinutes += minutes;
      if (participantMatchesRole(p, speakerUser)) speakerMinutes += minutes;
    }

    return {
      available: true,
      listenerMinutes: Number(listenerMinutes.toFixed(2)),
      speakerMinutes: Number(speakerMinutes.toFixed(2)),
      speakerJoined: speakerMinutes > 0,
      source: "google_meet_api"
    };
  } catch (err) {
    return {
      available: false,
      reason: String(err?.message || "Failed to fetch Meet participant sessions.")
    };
  }
}

