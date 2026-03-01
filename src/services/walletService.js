function createId(prefix, counter) {
  return `${prefix}_${String(counter).padStart(6, "0")}`;
}

export function createMockWalletDb(seed = {}) {
  return {
    users: { ...(seed.users || {}) },
    bookings: { ...(seed.bookings || {}) },
    counters: {
      booking: Number(seed?.counters?.booking || 0)
    }
  };
}

export class WalletService {
  constructor(mockDb) {
    if (!mockDb || typeof mockDb !== "object") {
      throw new Error("WalletService requires a mock database object.");
    }
    if (!mockDb.users || !mockDb.bookings || !mockDb.counters) {
      throw new Error("Mock database must contain users, bookings, and counters.");
    }
    this.db = mockDb;
  }

  getUser(userId) {
    const user = this.db.users[userId];
    if (!user) throw new Error(`User not found: ${userId}`);
    return user;
  }

  getBooking(bookingId) {
    const booking = this.db.bookings[bookingId];
    if (!booking) throw new Error(`Booking not found: ${bookingId}`);
    return booking;
  }

  bookSession(speakerId, listenerId, amount) {
    const speaker = this.getUser(speakerId);
    const listener = this.getUser(listenerId);
    const safeAmount = Number(amount);
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      throw new Error("Amount must be a positive number.");
    }
    if (Number(speaker.balance || 0) < safeAmount) {
      throw new Error("Insufficient balance.");
    }

    speaker.balance = Number(speaker.balance || 0) - safeAmount;
    this.db.counters.booking += 1;
    const bookingId = createId("booking", this.db.counters.booking);
    this.db.bookings[bookingId] = {
      id: bookingId,
      speakerId,
      listenerId,
      amount: safeAmount,
      escrowAmount: safeAmount,
      status: "PAID_HELD",
      createdAt: new Date().toISOString(),
      releasedAt: null,
      refundedAt: null
    };

    return {
      booking: this.db.bookings[bookingId],
      speakerBalance: speaker.balance,
      listenerBalance: listener.balance
    };
  }

  releaseFunds(bookingId) {
    const booking = this.getBooking(bookingId);
    if (booking.status !== "PAID_HELD") {
      throw new Error(`Booking is not releasable from status: ${booking.status}`);
    }

    const listener = this.getUser(booking.listenerId);
    listener.balance = Number(listener.balance || 0) + Number(booking.escrowAmount || 0);
    booking.escrowAmount = 0;
    booking.status = "RELEASED";
    booking.releasedAt = new Date().toISOString();

    return {
      booking,
      listenerBalance: listener.balance
    };
  }

  refundFunds(bookingId) {
    const booking = this.getBooking(bookingId);
    if (booking.status !== "PAID_HELD") {
      throw new Error(`Booking is not refundable from status: ${booking.status}`);
    }

    const speaker = this.getUser(booking.speakerId);
    speaker.balance = Number(speaker.balance || 0) + Number(booking.escrowAmount || 0);
    booking.escrowAmount = 0;
    booking.status = "REFUNDED";
    booking.refundedAt = new Date().toISOString();

    return {
      booking,
      speakerBalance: speaker.balance
    };
  }
}

export function runWalletSimulationScenario() {
  const db = createMockWalletDb({
    users: {
      userA: { id: "userA", name: "User A", balance: 1000 },
      userB: { id: "userB", name: "User B", balance: 0 }
    }
  });
  const wallet = new WalletService(db);

  const bookingStep = wallet.bookSession("userA", "userB", 300);
  const bookingId = bookingStep.booking.id;
  const heldSnapshot = {
    speakerBalance: db.users.userA.balance,
    listenerBalance: db.users.userB.balance,
    escrowAmount: db.bookings[bookingId].escrowAmount,
    bookingStatus: db.bookings[bookingId].status
  };

  const releaseStep = wallet.releaseFunds(bookingId);
  const finalSnapshot = {
    speakerBalance: db.users.userA.balance,
    listenerBalance: db.users.userB.balance,
    escrowAmount: db.bookings[bookingId].escrowAmount,
    bookingStatus: db.bookings[bookingId].status
  };

  return {
    bookingId,
    heldSnapshot,
    finalSnapshot,
    booking: releaseStep.booking
  };
}
