const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const emailService = require('../services/email-service');

function getRoomsFilePath() {
  const uploadsDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return path.join(uploadsDir, 'rooms.json');
}

function loadRooms() {
  const filePath = getRoomsFilePath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading rooms.json:', err);
    return {};
  }
}

function saveRooms(rooms) {
  const filePath = getRoomsFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(rooms, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving rooms.json:', err);
  }
}

module.exports.createRoom = async (request, reply) => {
  try {
    const { assetId, assetName, roomName, password, emails = [] } = request.body || {};

    if (!assetId || !password) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required fields: assetId and password are required',
      });
    }

    const roomId = `room_${crypto.randomBytes(6).toString('hex')}`;
    const rooms = loadRooms();

    const newRoom = {
      roomId,
      assetId,
      assetName: assetName || 'Video Asset',
      roomName: roomName || `Watch Party: ${assetName || 'Media'}`,
      password,
      emails: Array.isArray(emails) ? emails : [emails].filter(Boolean),
      createdBy: request.user?.email || 'admin@noah.com',
      createdAt: new Date().toISOString(),
    };

    rooms[roomId] = newRoom;
    saveRooms(rooms);

    const clientAppUrl = request.headers.origin || 'http://localhost:3001';
    const joinUrl = `${clientAppUrl}/room/join/${roomId}`;

    // Send emails to invited recipients
    const mailer = request.server?.emailService || emailService;
    if (newRoom.emails.length > 0 && mailer) {
      for (const recipient of newRoom.emails) {
        const subject = `🎬 Invite: Join Live Watch Party "${newRoom.roomName}"`;
        const text = `You are invited to watch "${newRoom.assetName}" in a live synchronized room.\n\nJoin Link: ${joinUrl}\nPassword: ${password}`;
        const html = `
          <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; padding: 32px; border-radius: 16px; border: 1px solid #334155;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #60a5fa; font-size: 24px; margin: 0;">🎬 Noah Live Watch Party</h1>
            </div>
            <p style="font-size: 16px; color: #cbd5e1; line-height: 1.5;">You've been invited by <strong style="color: #fff;">${newRoom.createdBy}</strong> to join a live synchronized watch party room for asset:</p>
            <div style="background: #1e293b; padding: 16px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #3b82f6;">
              <h2 style="font-size: 18px; color: #fff; margin: 0 0 4px 0;">${newRoom.roomName}</h2>
              <p style="font-size: 14px; color: #94a3b8; margin: 0;">Asset: ${newRoom.assetName}</p>
            </div>
            <div style="background: #0284c7; background: linear-gradient(135deg, #2563eb, #7c3aed); padding: 20px; border-radius: 12px; text-align: center; margin: 24px 0;">
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e7ff;">Click below and enter your password to synchronize playback in real-time:</p>
              <a href="${joinUrl}" style="display: inline-block; background: #ffffff; color: #1e3a8a; font-weight: 700; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-size: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">Join Watch Room</a>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 12px 16px; border-radius: 8px; font-family: monospace; font-size: 14px; text-align: center;">
              Password: <strong style="color: #38bdf8; font-size: 16px;">${password}</strong>
            </div>
            <hr style="border: none; border-top: 1px solid #334155; margin: 28px 0 20px 0;" />
            <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">Noah Media Asset Management Platform &bull; Real-time Collaboration</p>
          </div>
        `;

        try {
          console.log(`Sending invite email via SendGrid to ${recipient}...`);
          await mailer.sendEmail({
            to: recipient,
            subject,
            text,
            html,
          });
        } catch (emailErr) {
          console.error(`Failed to send invite email to ${recipient}:`, emailErr);
        }
      }
    }

    return reply.code(201).send({
      success: true,
      message: 'Watch room created successfully',
      room: {
        roomId: newRoom.roomId,
        assetId: newRoom.assetId,
        assetName: newRoom.assetName,
        roomName: newRoom.roomName,
        joinUrl,
        password: newRoom.password,
        emails: newRoom.emails,
        createdAt: newRoom.createdAt,
      },
    });
  } catch (err) {
    console.error('Create room error:', err);
    return reply.code(500).send({
      success: false,
      error: 'Failed to create room',
      message: err.message,
    });
  }
};

module.exports.verifyRoom = async (request, reply) => {
  try {
    const { roomId, password, userName } = request.body || {};

    if (!roomId || !password) {
      return reply.code(400).send({
        success: false,
        error: 'Room ID and password are required',
      });
    }

    const rooms = loadRooms();
    const room = rooms[roomId];

    if (!room) {
      return reply.code(404).send({
        success: false,
        error: 'Watch room not found or expired',
      });
    }

    if (room.password !== password) {
      return reply.code(401).send({
        success: false,
        error: 'Invalid room password',
      });
    }

    return reply.send({
      success: true,
      room: {
        roomId: room.roomId,
        assetId: room.assetId,
        assetName: room.assetName,
        roomName: room.roomName,
        createdBy: room.createdBy,
        createdAt: room.createdAt,
      },
      userName: userName || 'Collaborator',
    });
  } catch (err) {
    console.error('Verify room error:', err);
    return reply.code(500).send({
      success: false,
      error: 'Failed to verify room',
      message: err.message,
    });
  }
};

module.exports.getRoomInfo = async (request, reply) => {
  try {
    const { roomId } = request.params;
    const rooms = loadRooms();
    const room = rooms[roomId];

    if (!room) {
      return reply.code(404).send({
        success: false,
        error: 'Watch room not found',
      });
    }

    return reply.send({
      success: true,
      room: {
        roomId: room.roomId,
        assetId: room.assetId,
        assetName: room.assetName,
        roomName: room.roomName,
        createdBy: room.createdBy,
        createdAt: room.createdAt,
      },
    });
  } catch (err) {
    return reply.code(500).send({
      success: false,
      error: err.message,
    });
  }
};

module.exports.listRooms = async (request, reply) => {
  try {
    const rooms = loadRooms();
    const roomList = Object.values(rooms).map((r) => ({
      roomId: r.roomId,
      assetId: r.assetId,
      assetName: r.assetName,
      roomName: r.roomName,
      emails: r.emails,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));

    return reply.send({
      success: true,
      rooms: roomList,
    });
  } catch (err) {
    return reply.code(500).send({
      success: false,
      error: err.message,
    });
  }
};
