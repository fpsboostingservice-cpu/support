const { 
    Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, 
    ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, 
    ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const transcript = require('discord-html-transcripts');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const CATEGORY_ID = process.env.CATEGORY_ID;
const LOGS_CHANNEL_ID = process.env.LOGS_CHANNEL_ID;
const OWNER_ID = process.env.OWNER_ID; 

const activeTickets = new Map();

client.once('ready', () => {
    console.log(`FPSWare Support Bot is Online!`);
});

// Setup Inicial
client.on('messageCreate', async (message) => {
    if (message.content === '!setup' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const embed = new EmbedBuilder()
            .setTitle('FPSWare Support Center')
            .setDescription('Please select a category to open a ticket.')
            .setColor('#2b2d31');

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

    // Detector de respuesta del dueño para cancelar el timer de 1 hora
    if (activeTickets.has(message.channel.id) && message.author.id === OWNER_ID) {
        const ticketData = activeTickets.get(message.channel.id);
        if (ticketData.timeout) {
            clearTimeout(ticketData.timeout);
            activeTickets.set(message.channel.id, { ...ticketData, replied: true, timeout: null });
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    
    // 1. MANEJO DEL MENU (ABRIR FORMULARIOS)
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_category') {
        const category = interaction.values[0];
        const modal = new ModalBuilder().setCustomId(`modal_${category}`).setTitle('Support Information');

        if (category === 'hwid_reset') {
            const keyInput = new TextInputBuilder().setCustomId('hwid_key').setLabel("License Key").setPlaceholder("Enter your key here").setStyle(TextInputStyle.Short).setRequired(true);
            const orderInput = new TextInputBuilder().setCustomId('hwid_order').setLabel("Order ID").setPlaceholder("Order ID (e.g. #1234)").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(keyInput), new ActionRowBuilder().addComponents(orderInput));
        } 
        else if (category === 'purchase') {
            const prodInput = new TextInputBuilder().setCustomId('buy_product').setLabel("What product do you want?").setStyle(TextInputStyle.Short).setRequired(true);
            const payInput = new TextInputBuilder().setCustomId('buy_method').setLabel("Payment Method").setPlaceholder("Stripe, Whop, Crypto...").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(prodInput), new ActionRowBuilder().addComponents(payInput));
        }
        else if (category === 'product_issue') {
            const orderInput = new TextInputBuilder().setCustomId('issue_order').setLabel("Order ID").setStyle(TextInputStyle.Short).setRequired(true);
            const nameInput = new TextInputBuilder().setCustomId('issue_name').setLabel("Product Name").setStyle(TextInputStyle.Short).setRequired(true);
            const descInput = new TextInputBuilder().setCustomId('issue_desc').setLabel("Describe the issue").setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(orderInput), new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(descInput));
        }
        else {
            const generalInput = new TextInputBuilder().setCustomId('general_msg').setLabel("How can we help you?").setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(generalInput));
        }

        return await interaction.showModal(modal);
    }

    // 2. MANEJO DEL FORMULARIO ENVIADO (CREAR CANAL)
    if (interaction.isModalSubmit()) {
        await interaction.deferReply({ ephemeral: true });
        const category = interaction.customId.replace('modal_', '');
        
        const channel = await interaction.guild.channels.create({
            name: `${category}-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: CATEGORY_ID,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ],
        });

        const infoEmbed = new EmbedBuilder().setTitle(`New Ticket: ${category.toUpperCase()}`).setColor('#2b2d31').setTimestamp();

        // Extraer datos según la categoría
        if (category === 'hwid_reset') {
            const key = interaction.fields.getTextInputValue('hwid_key');
            const order = interaction.fields.getTextInputValue('hwid_order');
            infoEmbed.addFields({ name: 'License Key', value: key }, { name: 'Order ID', value: order })
                     .setFooter({ text: '⚠️ If format is incorrect, this ticket will be ignored.' });
        } else if (category === 'purchase') {
            infoEmbed.addFields(
                { name: 'Product', value: interaction.fields.getTextInputValue('buy_product') },
                { name: 'Payment Method', value: interaction.fields.getTextInputValue('buy_method') }
            );
        } else if (category === 'product_issue') {
            infoEmbed.addFields(
                { name: 'Order ID', value: interaction.fields.getTextInputValue('issue_order') },
                { name: 'Product', value: interaction.fields.getTextInputValue('issue_name') },
                { name: 'Issue', value: interaction.fields.getTextInputValue('issue_desc') }
            );
        } else {
            infoEmbed.addFields({ name: 'Details', value: interaction.fields.getTextInputValue('general_msg') });
        }

        const closeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger)
        );

        await channel.send({ content: `<@${interaction.user.id}> | <@${OWNER_ID}>`, embeds: [infoEmbed], components: [closeRow] });
        await interaction.editReply({ content: `Ticket created: ${channel}` });

        // Timer de 1 hora de inactividad
        const timeout = setTimeout(async () => {
            const currentTicket = activeTickets.get(channel.id);
            if (currentTicket && !currentTicket.replied) {
                await channel.send("🕒 **System:** It seems the owner is currently offline. Please wait patiently.");
            }
        }, 3600000);

        activeTickets.set(channel.id, { replied: false, timeout: timeout });
    }

    // 3. CERRAR TICKET
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        await interaction.reply('Generating transcript and closing...');
        const attachment = await transcript.createTranscript(interaction.channel, { limit: -1, fileName: `fpsware-${interaction.channel.name}.html` });
        
        const logChannel = interaction.guild.channels.cache.get(LOGS_CHANNEL_ID);
        if (logChannel) await logChannel.send({ content: `Ticket closed: ${interaction.channel.name}`, files: [attachment] });

        if (activeTickets.has(interaction.channel.id)) {
            clearTimeout(activeTickets.get(interaction.channel.id).timeout);
            activeTickets.delete(interaction.channel.id);
        }
        setTimeout(() => interaction.channel.delete(), 5000);
    }
});

client.login(process.env.TOKEN);
