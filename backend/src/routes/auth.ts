import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

router.post('/google', asyncHandler(async (req, res) => {
  const { idToken } = req.body as { idToken?: string };
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.JWT_SECRET;

  if (!idToken) {
    res.status(400).json({ error: 'idToken is required' });
    return;
  }
  if (!clientId) {
    res.status(500).json({ error: 'Server misconfigured: GOOGLE_CLIENT_ID not set' });
    return;
  }
  if (!secret) {
    res.status(500).json({ error: 'Server misconfigured: JWT_SECRET not set' });
    return;
  }

  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.name) {
      res.status(401).json({ error: 'Google token missing required claims' });
      return;
    }

    const user = await prisma.user.upsert({
      where: { googleId: payload.sub },
      update: {
        email: payload.email,
        name: payload.name,
        avatarUrl: payload.picture ?? undefined,
      },
      create: {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        avatarUrl: payload.picture ?? undefined,
      },
    });

    const token = jwt.sign({ sub: user.id }, secret, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
    });
  } catch (err) {
    res.status(401).json({ error: `Google sign-in failed: ${(err as Error).message}` });
  }
}));

export default router;
