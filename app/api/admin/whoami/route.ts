import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/session";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      isAdmin: Boolean(user.isAdmin),
    },
  });
}
