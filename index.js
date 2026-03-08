const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
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

const CATEGORY_ID = process.env.CATEGORY_ID;
const LOGS_CHANNEL_ID = process.env.LOGS_CHANNEL_ID;
const OWNER_ID = process.env.OWNER_ID; // Tu ID para el mensaje de ausencia

// Mapa para rastrear tickets y timers de inactividad
const activeTickets = new Map();

client.once('ready', () => {
    console.log(`FPSWare Bot online! Monitoring tickets for Owner ID: ${OWNER_ID}`);
});

// Setup con Menú Desplegable
client.on('messageCreate', async (message) => {
    if (message.content === '!setup' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const embed = new EmbedBuilder()
            .setTitle('FPSWare Support Center')
            .setDescription('Welcome to **FPSWare**. Please select the category that best fits your request from the menu below.')
            .setColor('#2b2d31')
            .setThumbnail(client.user.displayAvatarURL());

        const menu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_category')
                .setPlaceholder('Select a support category...')
                .addOptions([
                    { label: 'Product Issue', value: 'product_issue', emoji: '🛠️' },
                    { label: 'Ask a Question', value: 'question', emoji: '❓' },
                    { label: 'Make a Purchase', value: 'purchase', emoji: '💰' },
                    { label: 'HWID Reset', value: 'hwid_reset', emoji: '💻' },
                    { label: 'Other', value: 'other', emoji: '📁' },
                ])
        );

        await message.channel.send({ embeds: [embed], components: [menu] });
    }

    // Lógica para detectar si el dueño respondió
    if (activeTickets.has(message.channel.id) && message.author.id === OWNER_ID) {
        const ticketData = activeTickets.get(message.channel.id);
        if (ticketData.timeout) {
            clearTimeout(ticketData.timeout);
            activeTickets.set(message.channel.id, { ...ticketData, replied: true, timeout: null });
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_category') {
        await interaction.deferReply({ ephemeral: true });

        const category = interaction.values[0];
        const channel = await interaction.guild.channels.create({
            name: `${category}-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: CATEGORY_ID,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ],
        });

        let description = "Please wait for a staff member.";
        let color = '#5865F2';

        // Configuración por categoría
        if (category === 'hwid_reset') {
            description = "**HWID RESET REQUEST**\n\nPlease provide:\n1. Your License Key\n2. Your Order ID\n\n⚠️ **WARNING:** If you do not follow this format, your ticket will be ignored.";
            color = '#ffaa00';
        } else if (category === 'purchase') {
            description = "**NEW PURCHASE**\n\nPlease specify:\n1. Which product you want to buy?\n2. Preferred payment method (Stripe, Whop, etc.)?";
            color = '#2ecc71';
        } else if (category === 'product_issue') {
            description = "**PRODUCT ISSUE**\n\nPlease provide:\n1. Order ID\n2. Product Name\n3. Detailed description of the issue.";
            color = '#e74c3c';
        }

        const ticketEmbed = new EmbedBuilder()
            .setTitle(`FPSWare Support: ${category.replace('_', ' ').toUpperCase()}`)
            .setDescription(description)
            .setColor(color)
            .setFooter({ text: 'FPSWare Automatic Support System' });

        const closeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        await channel.send({ content: `<@${interaction.user.id}>`, embeds: [ticketEmbed], components: [closeRow] });
        await interaction.editReply({ content: `Ticket created in ${channel}` });

        // --- Lógica de Inactividad del Dueño (1 hora) ---
        const timeout = setTimeout(async () => {
            const currentTicket = activeTickets.get(channel.id);
            if (currentTicket && !currentTicket.replied) {
                await channel.send("🕒 **System Notification:** It seems the owner is currently offline, perhaps sleeping or away from home. Please wait patiently, and you will be assisted as soon as possible. Thank you!");
            }
        }, 3600000); // 1 hora en milisegundos

        activeTickets.set(channel.id, { replied: false, timeout: timeout });
    }

    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        await interaction.reply('Closing ticket and archiving transcript...');
        
        const attachment = await transcript.createTranscript(interaction.channel, {
            limit: -1,
            fileName: `transcript-${interaction.channel.name}.html`,
            poweredBy: false
        });

        const logChannel = interaction.guild.channels.cache.get(LOGS_CHANNEL_ID);
        if (logChannel) {
            await logChannel.send({
                content: `**Ticket Closed:** ${interaction.channel.name}\n**User:** <@${interaction.user.id}>`,
                files: [attachment]
            });
        }

        // Limpiar datos y borrar canal
        if (activeTickets.has(interaction.channel.id)) {
            clearTimeout(activeTickets.get(interaction.channel.id).timeout);
            activeTickets.delete(interaction.channel.id);
        }

        setTimeout(() => interaction.channel.delete(), 5000);
    }
});

client.login(process.env.TOKEN);
