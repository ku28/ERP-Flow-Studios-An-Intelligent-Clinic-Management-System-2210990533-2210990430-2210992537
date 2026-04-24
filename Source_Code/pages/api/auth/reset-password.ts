import prisma from '../../../lib/prisma';

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Missing token or password' });

  // Find user by token and check expiry
  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: { gte: new Date() },
    },
  });
  if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

  // Update password and clear token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password, // Should be hashed in production
      resetToken: null,
      resetTokenExpiry: null,
    },
  });

  return res.status(200).json({ message: 'Password updated' });
}
