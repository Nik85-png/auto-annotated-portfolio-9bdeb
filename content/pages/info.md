---
type: PageLayout
title: About Myself / CV
metaTitle: About Myself / CV
metaDescription: MSc Data Analytics profile of Nikunj Prajapati, blending behavioural analysis, predictive modelling, and compliance-focused data operations.
socialImage: /images/about.jpg
colors: colors-a
backgroundImage:
  type: BackgroundImage
  url: /images/bg4.jpg
  backgroundSize: cover
  backgroundPosition: center
  backgroundRepeat: no-repeat
  opacity: 70
sections:
  - type: HeroSection
    elementId: info-hero
    colors: colors-f
    backgroundSize: full
    text: >+
      # Data Analytics Postgraduate | Admin Professional | Behavioural Data Explorer

      I am currently completing my MSc in Data Analytics at London Metropolitan
      University.

      I combine three strengths: mathematical precision, behavioural
      understanding, and real-world administrative data experience.

      By day, I work in healthcare administration managing structured client
      records, reviewing operational logs, and supporting compliance audits.
      By training, I build analytical models, clean behavioural datasets, and
      explore whether patterns predict outcomes.

      I am especially interested in behavioural analytics, predictive modelling,
      data quality, and turning messy datasets into meaningful insight.
    media:
      type: ImageBlock
      url: /images/nikunj-profile.jpg
      altText: Nikunj Prajapati
    styles:
      self:
        height: auto
        width: wide
        margin:
          - mt-0
          - mb-0
          - ml-0
          - mr-0
        padding:
          - pt-16
          - pb-12
          - pl-4
          - pr-4
        textAlign: left
  - type: DividerSection
    styles:
      self:
        width: wide
        padding:
          - pt-8
          - pb-8
          - pl-4
          - pr-4
        borderWidth: 1
        borderStyle: solid
  - type: FeaturedItemsSection
    subtitle: Connect
    colors: colors-f
    items:
      - type: FeaturedItem
        actions:
          - type: Link
            label: GitHub
            url: https://github.com/Nik85-png
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        actions:
          - type: Link
            label: LinkedIn
            url: https://www.linkedin.com/in/nikunj-prajapati-b8a3b7232
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        actions:
          - type: Link
            label: Email
            url: mailto:prajapatinick85@gmail.com
        styles:
          self:
            textAlign: left
    columns: 3
    spacingX: 80
    spacingY: 16
    styles:
      self:
        height: auto
        width: wide
        padding:
          - pt-8
          - pb-8
          - pl-4
          - pr-4
  - type: DividerSection
    styles:
      self:
        width: wide
        padding:
          - pt-8
          - pb-8
          - pl-4
          - pr-4
        borderWidth: 1
        borderStyle: solid
  - type: LabelsSection
    colors: colors-f
    subtitle: Technical Focus
    items:
      - type: Label
        label: Python (pandas, NumPy, scikit-learn)
      - type: Label
        label: SQL
      - type: Label
        label: R
      - type: Label
        label: Power BI
      - type: Label
        label: Statistical Modelling
      - type: Label
        label: Predictive Analytics
      - type: Label
        label: Data Cleaning
      - type: Label
        label: Feature Engineering
      - type: Label
        label: Data Visualisation
  - type: DividerSection
    styles:
      self:
        width: wide
        padding:
          - pt-12
          - pb-12
          - pl-4
          - pr-4
        borderWidth: 1
        borderStyle: solid
  - type: FeaturedItemsSection
    colors: colors-f
    items:
      - type: FeaturedItem
        subtitle: Experience
        text: |-
          **Current Role - PHC Home Care (Healthcare Administration)**

          * Maintain care plans and risk assessments across systems
          * Validate daily logs for data consistency and completeness
          * Track incidents and support reporting processes
          * Prepare datasets for audits and regulatory reviews

          This is sensitive, real-world data where integrity and accuracy have
          direct operational consequences.
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        subtitle: Education
        text: |-
          **MSc Data Analytics**

          * London Metropolitan University
          * Expected 2026

          **BSc Mathematics - Gujarat University**

          * Logical reasoning
          * Quantitative analysis
          * Numerical accuracy
          * Structured problem solving

          **BSc Education - Gujarat University**

          * Communication clarity
          * Behavioural understanding
          * Structured planning
          * Conflict management
        styles:
          self:
            textAlign: left
    columns: 2
    spacingX: 60
    spacingY: 60
    styles:
      self:
        height: auto
        width: wide
        padding:
          - pt-8
          - pb-8
          - pl-4
          - pr-4
        textAlign: left
  - type: DividerSection
    styles:
      self:
        width: wide
        padding:
          - pt-12
          - pb-12
          - pl-4
          - pr-4
        borderWidth: 1
        borderStyle: solid
  - type: FeaturedItemsSection
    colors: colors-f
    items:
      - type: FeaturedItem
        subtitle: Professional Skills
        text: |-
          * Attention to detail
          * Data integrity and compliance
          * Analytical thinking
          * Clear communication
          * Process improvement
          * Stakeholder collaboration
          * Professionalism under pressure
          * Confidential data handling
        styles:
          self:
            textAlign: left
      - type: FeaturedItem
        subtitle: Beyond Work
        text: |-
          * Ancient history (especially Egypt)
          * Fitness and running
          * Reading self-development and self-help books
          * Continuous learning as a personal hobby

          Math trained my thinking.
          Education trained my communication.
          Data analytics connects both.
        styles:
          self:
            textAlign: left
    columns: 2
    spacingX: 60
    spacingY: 60
    styles:
      self:
        height: auto
        width: wide
        padding:
          - pt-8
          - pb-8
          - pl-4
          - pr-4
        textAlign: left
  - type: DividerSection
    styles:
      self:
        width: wide
        padding:
          - pt-12
          - pb-12
          - pl-4
          - pr-4
        borderWidth: 1
        borderStyle: solid
  - type: ContactSection
    backgroundSize: full
    title: Let's build something insightful together
    colors: colors-f
    form:
      type: FormBlock
      elementId: contact-info
      fields:
        - type: TextFormControl
          name: name
          label: Name
          hideLabel: true
          placeholder: Name
          isRequired: true
          width: 1/2
        - type: EmailFormControl
          name: email
          label: Email
          hideLabel: true
          placeholder: Email
          isRequired: true
          width: 1/2
        - type: TextareaFormControl
          name: message
          label: Message
          hideLabel: true
          placeholder: Tell me about your opportunity, team, or project goals
          isRequired: true
          width: full
      submitLabel: Start the conversation
      styles:
        self:
          textAlign: center
    styles:
      self:
        height: auto
        width: narrow
        margin:
          - mt-0
          - mb-0
          - ml-4
          - mr-4
        padding:
          - pt-12
          - pb-12
          - pr-4
          - pl-4
        flexDirection: row
        textAlign: left
---
