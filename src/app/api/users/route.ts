import { prisma } from "@/lib/prisma";

export async function GET() {
  const users = await prisma.user.findMany();

  return Response.json(users);
}

export async function POST(request: Request) {
  const body = await request.json();

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
    },
  });

  return Response.json(user);
}