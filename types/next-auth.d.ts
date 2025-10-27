import "next-auth";

declare module "next-auth" {
  interface User {
    type: string;
  }
  interface Session {
    user: User & {
      id: string;
      type: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    type: string;
  }
}
