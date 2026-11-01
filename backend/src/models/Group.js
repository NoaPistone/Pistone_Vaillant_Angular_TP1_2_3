import mongoose from "mongoose";

/** Un groupe joue au plus avec quatre membres : un par instrument, comme un vrai groupe. */
export const MAX_MEMBERS = 4;

/*
 * Groupe de joueurs. On le rejoint avec son code d'invitation (6 caractères).
 * Les morceaux d'un membre sont jouables par tous les membres du groupe.
 */
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    code: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

// « Mes groupes » et « partage-t-on un groupe ? » filtrent sur les membres.
schema.index({ members: 1 });

/** Les membres doivent avoir été chargés avec populate("members", "name avatar"). */
schema.methods.toPublic = function (avatarById, viewerId) {
  return {
    id: this.id,
    name: this.name,
    code: this.code,
    isOwner: String(this.ownerId) === viewerId,
    members: this.members.map((member) => ({
      id: String(member._id),
      name: member.name,
      avatar: avatarById(member.avatar),
      isOwner: String(member._id) === String(this.ownerId),
    })),
  };
};

export const Group = mongoose.model("Group", schema);
