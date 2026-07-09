package com.imvj.cardledger.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import com.imvj.cardledger.feature.SearchViewModel
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.components.*
import com.imvj.cardledger.ui.nav.Routes
import com.imvj.cardledger.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(nav: NavHostController) {
    val c = app().container
    val vm: SearchViewModel = viewModel(factory = viewModelFactory {
        initializer { SearchViewModel(c) }
    })
    LaunchedEffect(Unit) { vm.load() }
    val s by vm.state.collectAsStateWithLifecycle()

    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(s.loading) {
        if (!s.loading) focusRequester.requestFocus()
    }

    Scaffold(
        containerColor = Base,
        topBar = {
            TopAppBar(
                title = {
                    OutlinedTextField(
                        value = s.query,
                        onValueChange = { vm.search(it) },
                        placeholder = { Text("Search transactions & payments…", color = Muted) },
                        modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color.Transparent,
                            unfocusedBorderColor = Color.Transparent,
                            focusedTextColor = OnDark,
                            unfocusedTextColor = OnDark,
                            cursorColor = Gold,
                        ),
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "back", tint = OnDark)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Base),
            )
        },
    ) { innerPadding ->
        if (s.loading) {
            Box(
                Modifier.fillMaxSize().padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = Gold)
            }
        } else {
            val cardMap = s.cards.associateBy { it.id }
            val holderMap = s.holders.associateBy { it.id }

            LazyColumn(Modifier.fillMaxSize().padding(innerPadding)) {
                if (s.results.isEmpty()) {
                    item {
                        Box(
                            Modifier.fillMaxWidth().padding(vertical = 64.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                if (s.query.isEmpty()) "Start typing to search" else "No results for \"${s.query}\"",
                                color = Muted,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                } else {
                    item {
                        Text(
                            "${s.results.size} record${if (s.results.size != 1) "s" else ""}",
                            color = Muted,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                        )
                    }
                    items(s.results, key = { it.id }) { item ->
                        LedgerTile(
                            item = item,
                            onClick = {
                                if (item.cardId != null) {
                                    nav.navigate("${Routes.CARD_DETAIL}/${item.cardId}")
                                } else {
                                    nav.navigate(Routes.HOLDERS)
                                }
                            }
                        )
                    }
                    item { Spacer(Modifier.height(16.dp)) }
                }
            }
        }
    }
}
