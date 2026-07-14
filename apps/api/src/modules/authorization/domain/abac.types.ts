export type AbacResourceContext = {
  resourceType: string;
  resourceId?: string;
  createdBy?: string;
  ownerId?: string;
  attributes?: Record<string, unknown>;
};

export type AbacCondition = {
  attribute: string;
  operator: 'eq' | 'neq' | 'in' | 'contains';
  value: unknown;
};
