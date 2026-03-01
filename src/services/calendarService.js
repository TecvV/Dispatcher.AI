import { env } from "../config/env.js";

function nextWeekdayAtHour(weekday, hour, minute = 0) {
  const now = new Date();
  const d = new Date(now);
  const delta = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  d.setHours(hour, minute, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 7);
  return d;
}

export async function createGroundingCalendarEvent({
  accessToken,
  calendarId = "primary",
  weekday = 4,
  hour = 18,
  timezone = "UTC"
}) {
  if (!accessToken) {
    return {
      created: false,
      reason: "Missing Google Calendar access token"
    };
  }

  const start = nextWeekdayAtHour(weekday, hour, 0);
  const end = new Date(start.getTime() + 15 * 60 * 1000);

  const res = await fetch(`${env.googleCalendarApiBase}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      summary: "Dispatcher.AI Grounding Break",
      description: "15-minute grounding exercise suggested by Dispatcher.AI insight report.",
      start: { dateTime: start.toISOString(), timeZone: timezone },
      end: { dateTime: end.toISOString(), timeZone: timezone },
      recurrence: ["RRULE:FREQ=WEEKLY"]
    })
  });

  if (!res.ok) {
    const body = await res.text();
    return {
      created: false,
      reason: `Google Calendar error ${res.status}: ${body}`
    };
  }

  const event = await res.json();
  return {
    created: true,
    eventId: event.id,
    htmlLink: event.htmlLink
  };
}

export async function createGoogleMeetAfterDays({
  accessToken,
  calendarId = "primary",
  timezone = "UTC",
  days = 2,
  attendeeEmail,
  attendeeName
}) {
  if (!accessToken) {
    return {
      created: false,
      reason: "Missing Google Calendar access token"
    };
  }

  const start = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  start.setHours(17, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const res = await fetch(
    `${env.googleCalendarApiBase}/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        summary: "Dispatcher.AI support check-in",
        description: `Support conversation with ${attendeeName || "contact"} arranged by Dispatcher.AI.`,
        start: { dateTime: start.toISOString(), timeZone: timezone },
        end: { dateTime: end.toISOString(), timeZone: timezone },
        attendees: attendeeEmail ? [{ email: attendeeEmail }] : [],
        conferenceData: {
          createRequest: {
            requestId: `wca-${Date.now()}`
          }
        }
      })
    }
  );

  if (!res.ok) {
    const body = await res.text();
    return {
      created: false,
      reason: `Google Calendar error ${res.status}: ${body}`
    };
  }
  const event = await res.json();
  return {
    created: true,
    eventId: event.id,
    htmlLink: event.htmlLink,
    meetLink: event.conferenceData?.entryPoints?.find((x) => x.entryPointType === "video")?.uri || null,
    conferenceId: event.conferenceData?.conferenceId || null
  };
}

export async function createGoogleMeetAtDateTime({
  accessToken,
  calendarId = "primary",
  timezone = "UTC",
  startAt,
  endAt,
  attendeeEmails = [],
  summary = "Dispatcher.AI support meeting",
  description = "Support meeting scheduled by Dispatcher.AI."
}) {
  if (!accessToken) {
    return {
      created: false,
      reason: "Missing Google Calendar access token"
    };
  }
  if (!startAt || !endAt) {
    return {
      created: false,
      reason: "Missing start/end datetime"
    };
  }

  const res = await fetch(
    `${env.googleCalendarApiBase}/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: new Date(startAt).toISOString(), timeZone: timezone },
        end: { dateTime: new Date(endAt).toISOString(), timeZone: timezone },
        attendees: attendeeEmails.map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId: `wca-exact-${Date.now()}`
          }
        }
      })
    }
  );

  if (!res.ok) {
    const body = await res.text();
    return {
      created: false,
      reason: `Google Calendar error ${res.status}: ${body}`
    };
  }

  const event = await res.json();
  return {
    created: true,
    eventId: event.id,
    htmlLink: event.htmlLink,
    meetLink: event.conferenceData?.entryPoints?.find((x) => x.entryPointType === "video")?.uri || null,
    conferenceId: event.conferenceData?.conferenceId || null
  };
}

