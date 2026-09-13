import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/lib/auth.config";

const HARDCODED_USERS = [
  { id: "admin-1", username: "admin", password: "admin123", role: "ADMIN" as const },
  { id: "customer-1", username: "customer", password: "customer123", role: "CUSTOMER" as const },
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const username = credentials?.username;
        const password = credentials?.password;
        if (typeof username !== "string" || typeof password !== "string") {
          return null;
        }

        const user = HARDCODED_USERS.find(
          (u) => u.username === username && u.password === password,
        );
        if (!user) return null;

        return { id: user.id, name: user.username, role: user.role };
      },
    }),
  ],
});
