export const PLAN_LIMITS = {
  free: {
    planName: "Free",
    responsesGeneratedPerDay: 1, // Not explicitly mentioned
    complexEventsPerDay: 1, // base-level event only
    complexEventsWithAttachmentPerDay: 0, // no attachments allowed
    justChatNanoPerDay: 20, // GPT-4.1 Nano only
    justChatMiniPerDay: 0,
    justChatFullPerDay: 0,
    justChatEventModePerDay: 1, // only 1 event via Add-Event mode
    justChatFileAndUrlPerDay: 0, // no uploads allowed
    focusNanoPerDay: 20,
    focusMiniPerDay: 0,
    focusFullPerDay: 0,
    focusFileAndUrlPerDay: 0, // no uploads allowed
    smartPlanContextAttachPerDay: 2, // no Smart-Plan context
    docLiveNanoPerDay: 10,
    docLiveMiniPerDay: 0,
    docLiveFullPerDay: 0,
    docFileAndUrlPerDay: 0, // no uploads allowed
    docContextAttachPerDay: 2, // no doc/Smart-Plan context
    docActionClickPerDay: 8, // smart-action buttons disabled
    smartPlanGenPerDay: 1,
    smartPlanUpdatePerDay: 0
  },
  basic: {
    planName: "Basic",
    responsesGeneratedPerDay: 3, // not specified, keep 0 or adjust if tracked
    complexEventsPerDay: 3,
    complexEventsWithAttachmentPerDay: 1, // up to 1/day with file/URL
    justChatNanoPerDay: 50,
    justChatMiniPerDay: 20,
    justChatFullPerDay: 0,
    justChatEventModePerDay: 3, // up to 3 events/day via Add-Event mode
    justChatFileAndUrlPerDay: 3, // total uploads/day
    focusNanoPerDay: 20,
    focusMiniPerDay: 10,
    focusFullPerDay: 0,
    focusFileAndUrlPerDay: 2, // up to 2 uploads/day
    smartPlanContextAttachPerDay: 3, // can include Smart-Plan context in Focus Mode
    docLiveNanoPerDay: 20,
    docLiveMiniPerDay: 10,
    docLiveFullPerDay: 0,
    docFileAndUrlPerDay: 1, // file/URL uploads to Doc Live
    docContextAttachPerDay: 3, // 1 doc/Smart-Plan context/day
    docActionClickPerDay: 20, // smart-action buttons
    smartPlanGenPerDay: 3,
    smartPlanUpdatePerDay: 1
  },
  pro: {
    planName: "Pro",
    responsesGeneratedPerDay: 5, // not specified, keep 0 or adjust if tracked
    complexEventsPerDay: 10,
    complexEventsWithAttachmentPerDay: 5,
    justChatNanoPerDay: 100,
    justChatMiniPerDay: 50,
    justChatFullPerDay: 20,
    justChatEventModePerDay: 9999, // effectively unlimited within message limits
    justChatFileAndUrlPerDay: 10, // uploads/day
    focusNanoPerDay: 50,
    focusMiniPerDay: 50,
    focusFullPerDay: 20,
    focusFileAndUrlPerDay: 5, // uploads/day
    smartPlanContextAttachPerDay: 9999, // full context allowed
    docLiveNanoPerDay: 30,
    docLiveMiniPerDay: 10,
    docLiveFullPerDay: 5,
    docFileAndUrlPerDay: 5, // documents/day
    docContextAttachPerDay: 5, // doc + Smart-Plan context/day
    docActionClickPerDay: 50, // smart-action buttons/day
    smartPlanGenPerDay: 5,
    smartPlanUpdatePerDay: 10
  }
};