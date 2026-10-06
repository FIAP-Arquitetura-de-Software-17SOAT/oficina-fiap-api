export interface CreateClientInput {
  name: string;
  document: string;
  email: string;
  phone: string;
}

export interface UpdateClientInput {
  name?: string;
  email?: string;
  phone?: string;
}

export interface CreateClientAccountInput {
  password: string;
}
