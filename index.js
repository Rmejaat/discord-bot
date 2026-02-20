require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ]
});

const TOKEN = process.env.TOKEN;
const ROLE_1_ID = process.env.ROLE_1_ID;
const ROLE_2_ID = process.env.ROLE_2_ID;
const GUILD_ID = process.env.GUILD_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const EMOJI_1 = process.env.EMOJI_1 || '🦋';
const EMOJI_2 = process.env.EMOJI_2 || '🐉';
const NOM_1 = process.env.NOM_1 || 'Papillons';
const NOM_2 = process.env.NOM_2 || 'Dragons';
const COULEUR_1 = process.env.COULEUR_1 || '#5865F2';
const COULEUR_2 = process.env.COULEUR_2 || '#ED4245';

// ==============================
// COMMANDES SLASH
// ==============================
const commands = [
  new SlashCommandBuilder()
    .setName('assignroles')
    .setDescription('Assigne un rôle à tous les membres qui n\'en ont pas encore')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('equipe')
    .setDescription('Affiche les membres d\'une équipe')
    .addStringOption(option =>
      option
        .setName('nom')
        .setDescription('Choisir l\'équipe')
        .setRequired(true)
        .addChoices(
          { name: 'Équipe 1', value: 'equipe1' },
          { name: 'Équipe 2', value: 'equipe2' }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Affiche les statistiques des deux équipes')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('resetroles')
    .setDescription('Retire les rôles d\'équipe à tous les membres')
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Commandes slash enregistrées');
  } catch (err) {
    console.error('❌ Erreur enregistrement commandes :', err);
  }
}

// ==============================
// FONCTION D'ATTRIBUTION
// ==============================
async function assignRole(member, role1, role2) {
  const count1 = role1.members.filter(m => !m.user.bot).size;
  const count2 = role2.members.filter(m => !m.user.bot).size;

  let roleToAssign;
  if (count1 < count2) {
    roleToAssign = role1;
  } else if (count2 < count1) {
    roleToAssign = role2;
  } else {
    roleToAssign = Math.random() < 0.5 ? role1 : role2;
  }

  await member.roles.add(roleToAssign);
  return roleToAssign;
}

// ==============================
// MP AU NOUVEAU MEMBRE
// ==============================
async function envoyerMP(member, role) {
  const estEquipe1 = role.id === ROLE_1_ID;
  const emoji = estEquipe1 ? EMOJI_1 : EMOJI_2;
  const nom = estEquipe1 ? NOM_1 : NOM_2;
  const couleur = estEquipe1 ? COULEUR_1 : COULEUR_2;

  const embed = new EmbedBuilder()
    .setColor(couleur)
    .setTitle(`${emoji} Bienvenue dans l'équipe ${nom} !`)
    .setDescription(`Salut **${member.displayName}** ! Tu as été assigné à l'équipe **${nom}** sur **${member.guild.name}**. Bonne chance ! 🎉`)
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp()
    .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() });

  try {
    await member.send({ embeds: [embed] });
  } catch (err) {
    console.log(`⚠️ Impossible d'envoyer un MP à ${member.user.tag} (DMs fermés)`);
  }
}

// ==============================
// READY
// ==============================
client.once('ready', async () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
  await registerCommands();
});

// ==============================
// NOUVEAU MEMBRE
// ==============================
client.on('guildMemberAdd', async (member) => {
  try {
    const guild = member.guild;
    const role1 = guild.roles.cache.get(ROLE_1_ID);
    const role2 = guild.roles.cache.get(ROLE_2_ID);

    if (!role1 || !role2) return console.error('❌ Rôles introuvables');

    const assigned = await assignRole(member, role1, role2);
    await envoyerMP(member, assigned);

    const emoji = assigned.id === ROLE_1_ID ? EMOJI_1 : EMOJI_2;
    console.log(`✅ ${member.user.tag} → "${assigned.name}" ${emoji}`);
  } catch (err) {
    console.error('❌ Erreur guildMemberAdd :', err);
  }
});

// ==============================
// COMMANDES
// ==============================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /assignroles
  if (interaction.commandName === 'assignroles') {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Tu dois être administrateur.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    try {
      const guild = interaction.guild;
      const role1 = guild.roles.cache.get(ROLE_1_ID);
      const role2 = guild.roles.cache.get(ROLE_2_ID);

      if (!role1 || !role2) return interaction.editReply('❌ Rôles introuvables.');

      const members = await guild.members.fetch();
      const unassigned = members.filter(m =>
        !m.user.bot &&
        !m.roles.cache.has(ROLE_1_ID) &&
        !m.roles.cache.has(ROLE_2_ID)
      );

      if (unassigned.size === 0) {
        return interaction.editReply('✅ Tous les membres ont déjà un rôle d\'équipe !');
      }

      let assignedCount = { [role1.name]: 0, [role2.name]: 0 };

      for (const [, member] of unassigned) {
        const assigned = await assignRole(member, role1, role2);
        await envoyerMP(member, assigned);
        assignedCount[assigned.name]++;
      }

      const finalCount1 = role1.members.filter(m => !m.user.bot).size;
      const finalCount2 = role2.members.filter(m => !m.user.bot).size;

      const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('✅ Attribution terminée !')
        .addFields(
          { name: `${EMOJI_1} ${NOM_1}`, value: `+${assignedCount[role1.name]} → **${finalCount1} total**`, inline: true },
          { name: `${EMOJI_2} ${NOM_2}`, value: `+${assignedCount[role2.name]} → **${finalCount2} total**`, inline: true },
          { name: '👥 Membres assignés', value: `${unassigned.size}`, inline: true }
        )
        .setTimestamp();

      interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('❌ Erreur /assignroles :', err);
      interaction.editReply('❌ Une erreur est survenue.');
    }
  }

  // /equipe
  if (interaction.commandName === 'equipe') {
    await interaction.deferReply();

    const choix = interaction.options.getString('nom');
    const roleId = choix === 'equipe1' ? ROLE_1_ID : ROLE_2_ID;
    const emoji = choix === 'equipe1' ? EMOJI_1 : EMOJI_2;
    const nom = choix === 'equipe1' ? NOM_1 : NOM_2;
    const couleur = choix === 'equipe1' ? COULEUR_1 : COULEUR_2;

    const guild = interaction.guild;
    await guild.members.fetch();

    const role = guild.roles.cache.get(roleId);
    if (!role) return interaction.editReply('❌ Rôle introuvable.');

    const membres = role.members.filter(m => !m.user.bot);

    if (membres.size === 0) {
      const embed = new EmbedBuilder()
        .setColor(couleur)
        .setTitle(`${emoji} Équipe ${nom}`)
        .setDescription('Cette équipe est vide pour l\'instant.')
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    const liste = membres.map(m => `• ${m.displayName}`).join('\n');

    const embed = new EmbedBuilder()
      .setColor(couleur)
      .setTitle(`${emoji} Équipe ${nom} — ${membres.size} membre(s)`)
      .setDescription(liste.length <= 4096 ? liste : liste.substring(0, 4090) + '\n...')
      .setTimestamp()
      .setFooter({ text: `${membres.size} membre(s) au total` });

    interaction.editReply({ embeds: [embed] });
  }

  // /stats
  if (interaction.commandName === 'stats') {
    await interaction.deferReply();

    const guild = interaction.guild;
    await guild.members.fetch();

    const role1 = guild.roles.cache.get(ROLE_1_ID);
    const role2 = guild.roles.cache.get(ROLE_2_ID);

    if (!role1 || !role2) return interaction.editReply('❌ Rôles introuvables.');

    const count1 = role1.members.filter(m => !m.user.bot).size;
    const count2 = role2.members.filter(m => !m.user.bot).size;
    const total = count1 + count2;

    const BARRE_TAILLE = 20;
    const blocs1 = total === 0 ? 10 : Math.round((count1 / total) * BARRE_TAILLE);
    const blocs2 = BARRE_TAILLE - blocs1;
    const barre = `${EMOJI_1} ${'█'.repeat(blocs1)}${'░'.repeat(blocs2)} ${EMOJI_2}`;

    let statut;
    if (count1 === count2) statut = '⚖️ Égalité parfaite !';
    else if (count1 > count2) statut = `${EMOJI_1} **${NOM_1}** en avance de ${count1 - count2} membre(s)`;
    else statut = `${EMOJI_2} **${NOM_2}** en avance de ${count2 - count1} membre(s)`;

    const embed = new EmbedBuilder()
      .setColor('#FEE75C')
      .setTitle('📊 Statistiques des équipes')
      .addFields(
        { name: `${EMOJI_1} ${NOM_1}`, value: `**${count1}** membre(s)`, inline: true },
        { name: `${EMOJI_2} ${NOM_2}`, value: `**${count2}** membre(s)`, inline: true },
        { name: '👥 Total', value: `**${total}** membre(s)`, inline: true },
        { name: 'Répartition', value: `\`\`\`${barre}\`\`\`` },
        { name: 'Statut', value: statut }
      )
      .setTimestamp();

    interaction.editReply({ embeds: [embed] });
  }

  // /resetroles
  if (interaction.commandName === 'resetroles') {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Tu dois être administrateur.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    try {
      const guild = interaction.guild;
      const role1 = guild.roles.cache.get(ROLE_1_ID);
      const role2 = guild.roles.cache.get(ROLE_2_ID);

      if (!role1 || !role2) return interaction.editReply('❌ Rôles introuvables.');

      const members = await guild.members.fetch();
      const assigned = members.filter(m =>
        !m.user.bot &&
        (m.roles.cache.has(ROLE_1_ID) || m.roles.cache.has(ROLE_2_ID))
      );

      if (assigned.size === 0) {
        return interaction.editReply('✅ Aucun membre n\'a de rôle d\'équipe !');
      }

      for (const [, member] of assigned) {
        if (member.roles.cache.has(ROLE_1_ID)) await member.roles.remove(role1);
        if (member.roles.cache.has(ROLE_2_ID)) await member.roles.remove(role2);
      }

      const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('🔄 Réinitialisation terminée')
        .setDescription(`Les rôles **${NOM_1}** et **${NOM_2}** ont été retirés à **${assigned.size}** membre(s).`)
        .setTimestamp();

      interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('❌ Erreur /resetroles :', err);
      interaction.editReply('❌ Une erreur est survenue.');
    }
  }
});

client.login(TOKEN);