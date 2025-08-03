export interface User {
  id: string;
  username: string;
  email: string;
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  username: string;
  email: string;
  roles?: string[];
}

export interface UpdateUserDto {
  username?: string;
  email?: string;
  roles?: string[];
}