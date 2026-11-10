class FakeQuery {
  constructor(db, tableName) {
    this.db = db;
    this.tableName = tableName;
    this.predicates = [];
  }

  withIndex(_indexName, builder) {
    const conditions = [];
    const q = {
      eq: (field, value) => {
        conditions.push({ field, value });
        return q;
      },
    };
    builder(q);
    this.predicates.push((doc) =>
      conditions.every((condition) => doc[condition.field] === condition.value)
    );
    return this;
  }

  filter(builder) {
    const buildPredicate = (expression) => {
      if (
        expression?.op === 'eq' &&
        expression.left &&
        typeof expression.left.__field === 'string'
      ) {
        return (doc) => doc[expression.left.__field] === expression.right;
      }
      if (expression?.op === 'and' && Array.isArray(expression.conditions)) {
        const predicates = expression.conditions
          .map((condition) => buildPredicate(condition))
          .filter(Boolean);
        return (doc) => predicates.every((predicate) => predicate(doc));
      }
      return null;
    };

    const q = {
      field: (fieldName) => ({ __field: fieldName }),
      eq: (left, right) => ({ op: 'eq', left, right }),
      and: (...conditions) => ({ op: 'and', conditions }),
    };
    const expression = builder(q);
    const predicate = buildPredicate(expression);
    if (predicate) {
      this.predicates.push(predicate);
    }
    return this;
  }

  docs() {
    const docs = this.db.rows(this.tableName);
    return docs.filter((doc) =>
      this.predicates.every((predicate) => predicate(doc))
    );
  }

  async first() {
    if (
      this.tableName === 'scanTokenEvents' &&
      this.db.failNextScanTokenLookup === true
    ) {
      this.db.failNextScanTokenLookup = false;
      throw new Error('TRANSIENT_DB_ERROR');
    }
    return this.docs()[0] ?? null;
  }

  async unique() {
    const docs = this.docs();
    if (docs.length === 0) {
      return null;
    }
    if (docs.length > 1) {
      throw new Error(`Expected unique result in ${this.tableName}`);
    }
    return docs[0];
  }

  async take(count) {
    return this.docs().slice(0, count);
  }

  async collect() {
    return this.docs();
  }
}

class FakeDb {
  constructor(tables) {
    this.tables = tables;
    this.counter = 0;
    this.failNextScanTokenLookup = false;
  }

  query(tableName) {
    return new FakeQuery(this, tableName);
  }

  rows(tableName) {
    if (!this.tables[tableName]) {
      this.tables[tableName] = [];
    }
    return this.tables[tableName];
  }

  async get(id) {
    for (const tableName of Object.keys(this.tables)) {
      const row = this.rows(tableName).find((doc) => doc._id === id);
      if (row) {
        return row;
      }
    }
    return null;
  }

  async insert(tableName, value) {
    const row = { ...value };
    if (!row._id) {
      this.counter += 1;
      row._id = `${tableName}_${this.counter}`;
    }
    this.rows(tableName).push(row);
    return row._id;
  }

  async patch(id, patch) {
    for (const tableName of Object.keys(this.tables)) {
      const rows = this.rows(tableName);
      const index = rows.findIndex((doc) => doc._id === id);
      if (index >= 0) {
        rows[index] = { ...rows[index], ...patch };
        return;
      }
    }
    throw new Error(`PATCH_TARGET_NOT_FOUND:${id}`);
  }
}

function buildBusiness(overrides = {}) {
  const now = Date.now();
  return {
    _id: 'business_1',
    ownerUserId: 'owner_1',
    externalId: 'biz-1',
    name: 'Business',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    subscriptionPlan: 'starter',
    subscriptionStatus: 'active',
    subscriptionStartAt: now,
    subscriptionEndAt: null,
    billingPeriod: null,
    ...overrides,
  };
}

function buildProgram(overrides = {}) {
  const now = Date.now();
  return {
    _id: 'program_1',
    businessId: 'business_1',
    status: 'active',
    isArchived: false,
    isActive: true,
    title: 'Main Card',
    rewardName: 'Free Coffee',
    maxStamps: 10,
    stampIcon: '☕',
    allowPosEnroll: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildCtx(tables, subject = 'staff_1') {
  return {
    db: new FakeDb(tables),
    auth: {
      getUserIdentity: async () => (subject ? { subject } : null),
    },
  };
}

function baseTables(overrides = {}) {
  const now = Date.now();
  return {
    users: [
      {
        _id: 'staff_1',
        isActive: true,
        fullName: 'Staff User',
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: 'customer_1',
        isActive: true,
        fullName: 'Customer User',
        createdAt: now,
        updatedAt: now,
      },
    ],
    businesses: [buildBusiness()],
    businessStaff: [
      {
        _id: 'staff_link_1',
        businessId: 'business_1',
        userId: 'staff_1',
        staffRole: 'owner',
        isActive: true,
        createdAt: now,
      },
    ],
    loyaltyPrograms: [buildProgram()],
    memberships: [],
    events: [],
    campaigns: [],
    aiUsageLedger: [],
    scanTokenEvents: [],
    scanSessions: [],
    businessBillingAccounts: [
      {
        _id: 'billing_1',
        businessId: 'business_1',
        ownerUserId: 'owner_1',
        providerAppUserId: 'ba_testidentitytoken1234',
        plan: 'starter',
        lastPlan: 'starter',
        status: 'active',
        hasProviderEvidence: true,
        currentPeriodEndAt: now + 86_400_000,
      },
    ],
    ...overrides,
  };
}

export { FakeDb, buildCtx, baseTables, buildBusiness, buildProgram };
