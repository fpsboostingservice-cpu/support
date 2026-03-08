const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    PermissionsBitField, 
    ChannelType 
} = require('discord.js');
const transcript = require('discord-html-transcripts');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// --- CONFIGURATION ---
const CATEGORY_ID = process.env.CATEGORY_ID; // Support category ID
const LOGS_CHANNEL_ID = process.env.LOGS_CHANNEL_ID; // Where transcripts go

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('FPSWare Support Bot is active.');
});

// Command to setup the ticket panel (Run this once in your support channel)
client.on('messageCreate', async (message) => {
    if (message.content === '!setup' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const embed = new EmbedBuilder()
            .setTitle('FPSWare Support')
            .setDescription('Click the button below to open a support ticket.\nOur staff will assist you shortly regarding your software or license.')
            .setColor('#2b2d31')
            .setFooter({ text: 'FPSWare Official Support' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('open_ticket')
                .setLabel('Open Ticket')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎫')
        );

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

// Interaction Handling
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    // OPEN TICKET
    if (interaction.customId === 'open_ticket') {
        await interaction.deferReply({ ephemeral: true });

        const channel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: CATEGORY_ID,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ],
        });

        const ticketEmbed = new EmbedBuilder()
            .setTitle('FPSWare Support Ticket')
            .setDescription(`Hello ${interaction.user.username}, thank you for contacting FPSWare.\n\nPlease describe your issue or provide your Order ID. A staff member will be with you soon.`)
            .setColor('#5865F2');

        const closeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Close & Archive')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
        );

        await channel.send({ content: `<@${interaction.user.id}>`, embeds: [ticketEmbed], components: [closeRow] });
        await interaction.editReply({ content: `Ticket created: ${channel}` });
    }

    // CLOSE TICKET & TRANSCRIPT
    if (interaction.customId === 'close_ticket') {
        await interaction.reply('Closing ticket and generating transcript...');

        const logChannel = interaction.guild.channels.cache.get(LOGS_CHANNEL_ID);
        
        // Generate Transcript
        const attachment = await transcript.createTranscript(interaction.channel, {
            limit: -1,
            fileName: `transcript-${interaction.channel.name}.html`,
            poweredBy: false
        });

        if (logChannel) {
            await logChannel.send({
                content: `**Ticket Closed:** ${interaction.channel.name}\n**Closed by:** ${interaction.user.tag}`,
                files: [attachment]
            });
        }

        setTimeout(() => interaction.channel.delete(), 5000);
    }
});

client.login(process.env.TOKEN);
