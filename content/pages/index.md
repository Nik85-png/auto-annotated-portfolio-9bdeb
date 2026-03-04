---
type: PageLayout
title: Home
metaTitle: Home
metaDescription: Data analytics portfolio of Nikunj Prajapati, focused on behavioural analysis, predictive modelling, and structured operational data.
socialImage: /images/featured-Image6.jpg
colors: colors-a
backgroundImage:
  type: BackgroundImage
  url: /images/bg1.jpg
  backgroundSize: cover
  backgroundPosition: center
  backgroundRepeat: no-repeat
  opacity: 65
sections:
  - type: HeroSection
    elementId: home-hero
    colors: colors-f
    backgroundSize: full
    title: Data Analytics Postgraduate | Admin Professional | Behavioural Data Explorer
    subtitle: >-
      I am a data analytics postgraduate based in London. I work with structured
      datasets, behavioural patterns, compliance systems, and the kind of messy
      real-world data that does not clean itself. This is my space to show the
      work behind the titles: how I think, build, analyse, and improve systems.
    actions:
      - type: Link
        label: Explore projects
        url: /projects
      - type: Link
        label: Know about me
        url: /info
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
          - pt-36
          - pb-40
          - pl-4
          - pr-4
        flexDirection: row
        textAlign: left
  - type: CtaSection
    elementId: home-about-cta
    colors: colors-f
    title: Know About Me
    text: >-
      Explore my background, education, technical focus, and professional
      profile in one place.
    actions:
      - type: Link
        label: About Myself / CV
        url: /info
    styles:
      self:
        width: wide
        padding:
          - pt-10
          - pb-10
          - pl-4
          - pr-4
        textAlign: left
  - type: FeaturedProjectsSection
    elementId: home-projects
    colors: colors-f
    subtitle: Featured Project
    actions:
      - type: Link
        label: See all projects
        url: /projects
    showDate: true
    showDescription: true
    showFeaturedImage: true
    showReadMoreLink: true
    variant: variant-b
    projects:
      - content/pages/projects/hf-risk-journal.md
      - content/pages/projects/cards-project.md
    styles:
      self:
        height: auto
        width: wide
        padding:
          - pt-24
          - pb-24
          - pl-4
          - pr-4
        textAlign: left
  - type: ContactSection
    colors: colors-f
    backgroundSize: full
    title: Let's build something insightful together
    form:
      type: FormBlock
      elementId: contact-home
      fields:
        - type: TextFormControl
          name: firstName
          label: First Name
          hideLabel: true
          placeholder: First Name
          isRequired: true
          width: 1/2
        - type: TextFormControl
          name: lastName
          label: Last Name
          hideLabel: true
          placeholder: Last Name
          isRequired: false
          width: 1/2
        - type: EmailFormControl
          name: email
          label: Email
          hideLabel: true
          placeholder: Email
          isRequired: true
          width: full
        - type: TextareaFormControl
          name: message
          label: Message
          hideLabel: true
          placeholder: Tell me about your role, team, project, or analysis goal
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
          - ml-0
          - mr-0
        padding:
          - pt-24
          - pb-24
          - pr-4
          - pl-4
        flexDirection: row
        textAlign: left
---
