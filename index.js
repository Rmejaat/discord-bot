require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');

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
          { name: '🦋 Papillons', value: 'papillons' },
          { name: '🐉 Dragons', value: 'dragons' }
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
    console.log(`✅ ${member.user.tag} → "${assigned.name}"`);
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
      return interaction.reply({ content: '❌ Tu dois être administrateur.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

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
        assignedCount[assigned.name]++;
      }

      const finalCount1 = role1.members.filter(m => !m.user.bot).size;
      const finalCount2 = role2.members.filter(m => !m.user.bot).size;

      interaction.editReply(
        `✅ **${unassigned.size} membres assignés !**\n` +
        `🦋 Papillons : +${assignedCount[role1.name]} → **${finalCount1} total**\n` +
        `🐉 Dragons : +${assignedCount[role2.name]} → **${finalCount2} total**`
      );
    } catch (err) {
      console.error('❌ Erreur /assignroles :', err);
      interaction.editReply('❌ Une erreur est survenue.');
    }
  }

  // /equipe
  if (interaction.commandName === 'equipe') {
    await interaction.deferReply();

    const choix = interaction.options.getString('nom');
    const roleId = choix === 'papillons' ? ROLE_1_ID : ROLE_2_ID;
    const emoji = choix === 'papillons' ? '🦋' : '🐉';
    const nom = choix === 'papillons' ? 'Papillons' : 'Dragons';

    const guild = interaction.guild;
    await guild.members.fetch();

    const role = guild.roles.cache.get(roleId);
    if (!role) return interaction.editReply('❌ Rôle introuvable.');

    const membres = role.members.filter(m => !m.user.bot);
    if (membres.size === 0) {
      return interaction.editReply(`${emoji} L'équipe **${nom}** est vide pour l'instant.`);
    }

    const liste = membres.map(m => `• ${m.displayName}`).join('\n');
    const contenu = `${emoji} **Équipe ${nom}** — ${membres.size} membre(s) :\n\n${liste}`;

    if (contenu.length <= 2000) {
      interaction.editReply(contenu);
    } else {
      const lignes = liste.split('\n');
      let chunk = `${emoji} **Équipe ${nom}** — ${membres.size} membre(s) :\n\n`;
      await interaction.editReply(`${emoji} **Équipe ${nom}** — ${membres.size} membre(s) :`);

      for (const ligne of lignes) {
        if ((chunk + ligne + '\n').length > 2000) {
          await interaction.followUp({ content: chunk });
          chunk = '';
        }
        chunk += ligne + '\n';
      }
      if (chunk) await interaction.followUp({ content: chunk });
    }
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
    const barre = `🦋 ${'█'.repeat(blocs1)}${'░'.repeat(blocs2)} 🐉`;

    let statut;
    if (count1 === count2) statut = '⚖️ **Égalité parfaite !**';
    else if (count1 > count2) statut = `🦋 **Papillons en avance** de ${count1 - count2} membre(s)`;
    else statut = `🐉 **Dragons en avance** de ${count2 - count1} membre(s)`;

    interaction.editReply(
      `📊 **Statistiques des équipes**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🦋 **Papillons** : ${count1} membre(s)\n` +
      `🐉 **Dragons** : ${count2} membre(s)\n` +
      `👥 **Total** : ${total} membre(s)\n\n` +
      `${barre}\n\n` +
      `${statut}`
    );
  }
  //resetroles
  if (interaction.commandName === 'resetroles') {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Tu dois être administrateur.', ephemeral: true });
    }
  
    await interaction.deferReply({ ephemeral: true });
  
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
  
      interaction.editReply(`✅ **${assigned.size} membres réinitialisés !** Les rôles Papillons et Dragons ont été retirés.`);
  
    } catch (err) {
      console.error('❌ Erreur /resetroles :', err);
      interaction.editReply('❌ Une erreur est survenue.');
    }
  }
});

client.login(TOKEN);